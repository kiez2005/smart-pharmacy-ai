import { Request, Response } from 'express';
import { z } from 'zod';
import { AiServiceError, aiGatewayService } from '../services/ai.service';
import {
  createKnowledgeDocument,
  ingestKnowledgeFile,
  listKnowledgeDocuments,
  toggleKnowledgeDocument,
} from '../services/knowledge.service';

const chatRagSchema = z.object({
  message: z.string().trim().min(2, 'Vui lòng nhập câu hỏi về thuốc hoặc triệu chứng cần tư vấn'),
  mode: z.enum(['DRUG_QA', 'SYMPTOM_CONSULTATION']).optional(),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string(),
      })
    )
    .optional()
    .default([]),
});

const verifyOcrLinesSchema = z.object({
  lines: z
    .array(
      z.object({
        lineId: z.string().trim().min(1),
        selectedProductId: z.coerce.number().int().positive().nullable(),
        quantity: z.coerce.number().int().min(1).default(1),
        dosage: z.string().trim().optional(),
        confirmed: z.boolean(),
        skipped: z.boolean().optional().default(false),
      })
    )
    .min(1, 'Cần gửi ít nhất 1 dòng OCR để xác nhận'),
});

const createKnowledgeSchema = z.object({
  ProductID: z.coerce.number().int().positive().nullable().optional(),
  DocType: z.enum(['LEAFLET', 'GUIDELINE', 'FAQ']).optional().default('LEAFLET'),
  Title: z.string().trim().min(3, 'Tiêu đề tài liệu tối thiểu 3 ký tự'),
  Section: z.string().trim().min(2, 'Tên mục tài liệu không được rỗng'),
  Content: z.string().trim().min(15, 'Nội dung tài liệu tối thiểu 15 ký tự'),
  SourceName: z.string().trim().min(3, 'Vui lòng ghi rõ tên nguồn Dược thư / HDSD'),
  SourceRef: z.string().trim().nullable().optional(),
  VerifiedBy: z.string().trim().optional(),
});

function handleAiHttpError(res: Response, error: unknown, fallbackMessage: string): void {
  if (error instanceof AiServiceError) {
    res.status(error.statusCode).json({
      success: false,
      code: error.code,
      model: error.model,
      message: error.message,
    });
    return;
  }

  const statusCode = Number((error as { statusCode?: number })?.statusCode || 500);
  res.status(statusCode >= 400 && statusCode < 600 ? statusCode : 500).json({
    success: false,
    code: 'AI_INTERNAL_ERROR',
    message: error instanceof Error ? error.message : fallbackMessage,
  });
}

/**
 * 0. HEALTH CHECK CÁC MODEL AI LOCAL (GET /api/ai/health)
 */
export const getAiHealth = async (_req: Request, res: Response): Promise<void> => {
  const report = await aiGatewayService.getModelsHealth();
  res.json({
    success: true,
    data: report,
  });
};

/**
 * 1. OCR ĐƠN THUỐC THẬT BẰNG OPENCV + RAPIDOCR (POST /api/ai/ocr-prescription)
 * Trả Top-K ứng viên mỗi dòng + draftId; mọi dòng mặc định chưa xác nhận.
 */
export const ocrPrescription = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.file || !req.file.buffer) {
      res.status(400).json({
        success: false,
        code: 'MISSING_PRESCRIPTION_IMAGE',
        message: 'Vui lòng tải lên ảnh đơn thuốc thực tế (PNG/JPG/WEBP). Chế độ giả lập đã được gỡ bỏ.',
      });
      return;
    }

    const result = await aiGatewayService.processPrescriptionOcr(
      req.file.buffer,
      req.file.originalname,
      req.user?.UserID
    );

    res.json({
      success: true,
      message:
        'Đã bóc tách đơn thuốc bằng OpenCV + RapidOCR. Vui lòng chọn đúng thuốc theo độ tin cậy và tích xác nhận từng dòng.',
      data: result,
    });
  } catch (error) {
    handleAiHttpError(res, error, 'Không thể xử lý OCR đơn thuốc');
  }
};

/**
 * 1b. DƯỢC SĨ XÁC NHẬN TỪNG DÒNG OCR TRƯỚC KHI CHUYỂN POS / TẠO HÓA ĐƠN (POST /api/ai/ocr-drafts/:draftId/verify)
 */
export const verifyOcrDraft = async (req: Request, res: Response): Promise<void> => {
  try {
    const draftId = String(req.params.draftId || '').trim();
    const parsed = verifyOcrLinesSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        code: 'INVALID_VERIFICATION_PAYLOAD',
        message: 'Dữ liệu xác nhận dòng OCR không hợp lệ',
        errors: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const result = await aiGatewayService.verifyOcrDraftLines(draftId, parsed.data.lines);
    res.json({
      success: true,
      message: 'Đã xác nhận toàn bộ dòng thuốc OCR — sẵn sàng chuyển sang POS.',
      data: result,
    });
  } catch (error) {
    handleAiHttpError(res, error, 'Không thể xác nhận bản nháp OCR');
  }
};

/**
 * 2. NHẬN DẠNG GIỌNG NÓI LOCAL BẰNG FASTER-WHISPER (POST /api/ai/speech-to-text)
 */
export const speechToText = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.file || !req.file.buffer) {
      res.status(400).json({
        success: false,
        code: 'MISSING_AUDIO_FILE',
        message: 'Vui lòng gửi file ghi âm giọng nói.',
      });
      return;
    }

    const language = String(req.body?.language || req.query.language || 'vi');
    const result = await aiGatewayService.speechToText(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype,
      language
    );

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    handleAiHttpError(res, error, 'Không thể nhận dạng giọng nói');
  }
};

/**
 * 3. CHATBOT DƯỢC LÂM SÀNG RAG CÓ NGUỒN DÙNG DUY NHẤT QWEN 2.5 7B (POST /api/ai/chat-rag & /api/ai/diagnose-chat)
 */
export const chatRag = async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = chatRagSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        code: 'INVALID_CHAT_QUERY',
        message: 'Vui lòng nhập câu hỏi hoặc triệu chứng cần tư vấn',
        errors: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const result = await aiGatewayService.chatWithSources(
      parsed.data.message,
      parsed.data.mode,
      parsed.data.history
    );
    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    handleAiHttpError(res, error, 'Lỗi khi suy luận RAG với AI');
  }
};

export const chatRagStream = async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = chatRagSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        code: 'INVALID_CHAT_QUERY',
        message: 'Vui lòng nhập câu hỏi hoặc triệu chứng cần tư vấn',
        errors: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    await aiGatewayService.streamChatToExpressRes(
      {
        message: parsed.data.message,
        mode: parsed.data.mode,
        history: parsed.data.history,
        audience: 'STAFF',
      },
      res
    );
  } catch (error) {
    if (!res.headersSent) {
      handleAiHttpError(res, error, 'Lỗi khi mở luồng SSE Chatbot AI');
    } else {
      res.end();
    }
  }
};

export const diagnoseChat = chatRag;

/**
 * 4. QUẢN LÝ KHO TRI THỨC TỜ HDSD & DƯỢC THƯ KIỂM CHỨNG
 */
export const listKnowledgeDocsController = async (req: Request, res: Response): Promise<void> => {
  try {
    const data = await listKnowledgeDocuments({
      search: String(req.query.search || ''),
      docType: String(req.query.docType || 'ALL'),
      productId: req.query.productId ? Number(req.query.productId) : null,
      includeInactive: req.query.includeInactive === 'true',
      page: Number(req.query.page || 1),
      limit: Number(req.query.limit || 25),
    });
    res.json({ success: true, data });
  } catch (error) {
    handleAiHttpError(res, error, 'Không thể tải danh sách tài liệu Dược thư/HDSD');
  }
};

export const createKnowledgeDocController = async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = createKnowledgeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: 'Dữ liệu tài liệu kiểm chứng không hợp lệ',
        errors: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const result = await createKnowledgeDocument(parsed.data);
    res.status(201).json({
      success: true,
      message: 'Đã lưu tài liệu HDSD kiểm chứng và đồng bộ lại chỉ mục RAG.',
      data: result,
    });
  } catch (error) {
    handleAiHttpError(res, error, 'Không thể tạo tài liệu Dược thư/HDSD');
  }
};

export const uploadKnowledgeDocFileController = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.file || !req.file.buffer) {
      res.status(400).json({
        success: false,
        message: 'Vui lòng chọn tệp tài liệu (.pdf, .txt hoặc .md).',
      });
      return;
    }

    const result = await ingestKnowledgeFile(req.file.buffer, req.file.originalname, {
      ProductID: req.body?.ProductID ? Number(req.body.ProductID) : null,
      DocType: (req.body?.DocType as 'LEAFLET' | 'GUIDELINE' | 'FAQ') || 'LEAFLET',
      Title: req.body?.Title ? String(req.body.Title) : undefined,
      Section: req.body?.Section ? String(req.body.Section) : undefined,
      SourceName: req.body?.SourceName ? String(req.body.SourceName) : undefined,
      SourceRef: req.body?.SourceRef ? String(req.body.SourceRef) : undefined,
      VerifiedBy: req.body?.VerifiedBy ? String(req.body.VerifiedBy) : undefined,
    });

    res.status(201).json({
      success: true,
      message: `Đã trích xuất và nạp ${result.createdCount} đoạn tài liệu kiểm chứng vào Kho RAG.`,
      data: result,
    });
  } catch (error) {
    handleAiHttpError(res, error, 'Không thể nạp file tài liệu Dược thư');
  }
};

export const toggleKnowledgeDocController = async (req: Request, res: Response): Promise<void> => {
  try {
    const docId = Number(req.params.id);
    if (!Number.isInteger(docId) || docId <= 0) {
      res.status(400).json({ success: false, message: 'DocID không hợp lệ' });
      return;
    }
    const isActive = req.body?.isActive !== undefined ? Boolean(req.body.isActive) : true;
    const result = await toggleKnowledgeDocument(docId, isActive);
    res.json({ success: true, data: result });
  } catch (error) {
    handleAiHttpError(res, error, 'Không thể cập nhật trạng thái tài liệu');
  }
};
