import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../config/prisma';
import {
  AiServiceError,
  aiGatewayService,
  AttachmentOcrSummary,
} from '../services/ai.service';
import {
  getMailConfigStatus,
  isPlaceholderEmail,
  sendPharmacistConsultationReplyEmail,
  sendTestMailEmail,
  verifySmtpConnection,
} from '../services/mail.service';
import {
  extractRxFileKeyFromText,
  isValidRxFileKey,
  resolveSafePrescriptionFilePath,
} from '../services/prescription-storage.service';

const contactSchema = z.object({
  FullName: z.string().trim().min(2, 'Vui lòng nhập họ tên'),
  Email: z.string().trim().email('Email không hợp lệ'),
  Phone: z.string().trim().min(8, 'Số điện thoại không hợp lệ'),
  Subject: z.string().trim().min(3, 'Vui lòng nhập tiêu đề cần tư vấn'),
  Message: z.string().trim().min(5, 'Vui lòng nhập nội dung triệu chứng / câu hỏi'),
  Priority: z.enum(['HIGH', 'NORMAL', 'LOW']).optional(),
  AttachmentFileKey: z
    .string()
    .trim()
    .optional()
    .refine((val) => !val || isValidRxFileKey(val), {
      message: 'Mã tệp ảnh đơn thuốc đính kèm không hợp lệ',
    }),
});

const replySchema = z.object({
  ReplyNote: z.string().trim().min(2, 'Vui lòng nhập nội dung phản hồi của dược sĩ'),
  sendEmail: z.boolean().optional().default(true),
  RecipientEmail: z
    .string()
    .trim()
    .email('Email người nhận không hợp lệ')
    .optional()
    .or(z.literal('')),
  EmailSubject: z.string().trim().max(220).optional(),
});

const aiDraftSchema = z.object({
  style: z.enum(['STANDARD', 'CONCISE', 'FOLLOWUP_CARE']).optional().default('STANDARD'),
  includeAttachmentOcr: z.boolean().optional().default(true),
});

const testMailSchema = z.object({
  toEmail: z.string().trim().email('Email nhận thử nghiệm không hợp lệ').optional(),
});

function formatCustomerEmailSafeDraft(rawAnswer: string): string {
  let text = String(rawAnswer || '').trim();
  if (text.startsWith('{') && text.includes('"answer"')) {
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed.answer === 'string') {
        text = parsed.answer;
      }
    } catch {
      const m = text.match(/"answer"\s*:\s*"((?:[^"\\]|\\.)*)(?:"|$)/s);
      if (m?.[1]) {
        text = m[1]
          .replace(/\\n/g, '\n')
          .replace(/\\t/g, ' ')
          .replace(/\\"/g, '"')
          .replace(/\\\\/g, '\\');
      }
    }
  }
  return text
    .replace(/\n*\(Nguồn trích dẫn kiểm chứng:[^)]*\)/gi, '')
    .replace(/\s*\[DOC-\d+\]/g, '')
    .replace(/\*\*\s*\[?DOC-\d+\]?\s*\*\*/g, '')
    .trim();
}

function formatAttachmentOcrBlock(ocr: AttachmentOcrSummary | null): string {
  if (!ocr || ocr.lines.length === 0) return '';
  const rows = ocr.lines.map(
    (l, idx) =>
      `${idx + 1}. ${l.drug}${l.strengthTokens.length ? ` (${l.strengthTokens.join(', ')})` : ''} | SL: ${l.quantity} ${l.unit}${l.dosage ? ` | Liều: ${l.dosage}` : ''}`
  );
  return `\n[KẾT QUẢ AI ĐỌC TỪ ẢNH TOA THUỐC ĐÍNH KÈM (${ocr.sectionMode})]:\n${rows.join('\n')}`;
}

function normalizeContactDto<T extends { AttachmentFileKey?: string | null; Message: string }>(row: T): T {
  const effectiveKey = row.AttachmentFileKey || extractRxFileKeyFromText(row.Message);
  if (effectiveKey === row.AttachmentFileKey) return row;
  return {
    ...row,
    AttachmentFileKey: effectiveKey,
  };
}

/**
 * KIỂM TRA TRẠNG THÁI CẤU HÌNH GMAIL SMTP THẬT (GET /api/contacts/mail-status)
 */
export const getContactMailStatus = async (req: Request, res: Response): Promise<void> => {
  const checkLive = String(req.query.verify || '').toLowerCase() === 'true';
  const status = getMailConfigStatus();
  if (!checkLive) {
    res.json({ success: true, data: status });
    return;
  }
  const verifyResult = await verifySmtpConnection();
  res.json({
    success: true,
    data: {
      ...status,
      liveVerified: verifyResult.ok,
      verifyMessage: verifyResult.message,
    },
  });
};

/**
 * GỬI THỬ 1 EMAIL KIỂM TRA KẾT NỐI GMAIL SMTP (POST /api/contacts/test-mail)
 */
export const sendContactTestMail = async (req: Request, res: Response): Promise<void> => {
  const parsed = testMailSchema.safeParse(req.body || {});
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      message: 'Địa chỉ email kiểm tra không hợp lệ',
    });
    return;
  }

  const mailCfg = getMailConfigStatus();
  const targetEmail = parsed.data.toEmail || mailCfg.senderEmail || req.user?.Email || '';
  if (!targetEmail || isPlaceholderEmail(targetEmail)) {
    res.status(400).json({
      success: false,
      message: 'Vui lòng nhập một địa chỉ Gmail nhận thử nghiệm hợp lệ (không dùng email nội bộ).',
    });
    return;
  }

  const outcome = await sendTestMailEmail(targetEmail, req.user?.FullName || 'Dược sĩ');
  if (outcome.status !== 'SENT') {
    res.status(outcome.status === 'SKIPPED_NOT_CONFIGURED' ? 400 : 502).json({
      success: false,
      message: outcome.error || 'Không thể gửi email kiểm tra',
      data: outcome,
    });
    return;
  }

  res.json({
    success: true,
    message: `Đã gửi email kiểm tra tới ${outcome.toEmail} thành công!`,
    data: outcome,
  });
};

/**
 * LẤY DANH SÁCH LIÊN HỆ TƯ VẤN (GET /api/contacts)
 */
export const getContacts = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 50)));
    const skip = (page - 1) * limit;

    const [total, contacts] = await Promise.all([
      prisma.contact.count(),
      prisma.contact.findMany({
        orderBy: { CreateDate: 'desc' },
        skip,
        take: limit,
      }),
    ]);
    res.json({
      success: true,
      data: contacts.map(normalizeContactDto),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  } catch {
    res.status(500).json({
      success: false,
      message: 'Lỗi khi tải danh sách liên hệ tư vấn',
    });
  }
};

/**
 * GỬI YÊU CẦU LIÊN HỆ / TƯ VẤN DƯỢC SĨ (POST /api/contacts)
 */
export const createContact = async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = contactSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: 'Dữ liệu liên hệ không hợp lệ',
        errors: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const attachmentFileKey =
      parsed.data.AttachmentFileKey || extractRxFileKeyFromText(parsed.data.Message);

    const created = await prisma.contact.create({
      data: {
        FullName: parsed.data.FullName,
        Email: parsed.data.Email,
        Phone: parsed.data.Phone,
        Subject: parsed.data.Subject,
        Message: parsed.data.Message,
        Priority: parsed.data.Priority,
        AttachmentFileKey: attachmentFileKey,
      },
    });

    res.status(201).json({
      success: true,
      message: 'Đã gửi yêu cầu tư vấn tới Dược sĩ thành công',
      data: normalizeContactDto(created),
    });
  } catch {
    res.status(500).json({
      success: false,
      message: 'Lỗi khi gửi liên hệ',
    });
  }
};

/**
 * AI GỢI Ý SOẠN PHẢN HỒI LÂM SÀNG CHO DƯỢC SĨ (POST /api/contacts/:id/ai-draft-reply)
 * Chỉ tạo bản nháp + trích dẫn kiểm chứng + OCR ảnh đính kèm (nếu có), KHÔNG tự động gửi email.
 */
export const draftContactAiReply = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id) || id <= 0) {
      res.status(400).json({ success: false, message: 'Mã phiếu tư vấn không hợp lệ' });
      return;
    }

    const parsed = aiDraftSchema.safeParse(req.body || {});
    if (!parsed.success) {
      res.status(400).json({ success: false, message: 'Tham số gợi ý AI không hợp lệ' });
      return;
    }

    const contact = await prisma.contact.findUnique({ where: { ContactID: id } });
    if (!contact) {
      res.status(404).json({ success: false, message: 'Không tìm thấy phiếu tư vấn' });
      return;
    }

    const fileKey = contact.AttachmentFileKey || extractRxFileKeyFromText(contact.Message);
    let detectedRxSummary: AttachmentOcrSummary | null = null;
    if (fileKey && parsed.data.includeAttachmentOcr) {
      const safePath = resolveSafePrescriptionFilePath(fileKey);
      if (safePath) {
        detectedRxSummary = await aiGatewayService.scanAttachmentOcrSummary(safePath);
      }
    }

    const styleInstruction =
      parsed.data.style === 'CONCISE'
        ? 'Hãy soạn bản nháp phản hồi NGẮN GỌN, súc tích (khoảng 60-100 từ) để gửi nhanh qua Gmail cho bệnh nhân.'
        : parsed.data.style === 'FOLLOWUP_CARE'
          ? 'Hãy soạn bản nháp LỊCH SỰ HỎI THÊM thông tin cần thiết (tuổi, cân nặng nếu là trẻ em, tiền sử dị ứng, triệu chứng kèm theo) và dặn dấu hiệu cần đi khám.'
          : 'Hãy soạn bản nháp THƯ TƯ VẤN CHUYÊN MÔN đầy đủ gồm: định hướng sơ bộ, hướng dẫn dùng thuốc/chăm sóc an toàn, lưu ý chống chỉ định và dấu hiệu cảnh báo cần đi khám.';

    const pharmacistName = req.user?.FullName || 'Dược sĩ phụ trách';
    const ocrBlock = formatAttachmentOcrBlock(detectedRxSummary);
    const ragPrompt = [
      `Soạn giúp ${pharmacistName} thư phản hồi gửi khách hàng "${contact.FullName}" về chủ đề "${contact.Subject}".`,
      `Nội dung khách gửi: ${contact.Message.slice(0, 1200)}`,
      ocrBlock,
      styleInstruction,
      'Trình bày tự nhiên như lời Dược sĩ tư vấn trực tiếp cho khách hàng (xưng hô thân thiện Chào anh/chị hoặc bạn). Không tự bịa giá tiền hoặc tự kê đơn kháng sinh nếu chưa có đơn bác sĩ.',
    ]
      .filter(Boolean)
      .join('\n');

    const ragResult = await aiGatewayService.chatWithSources(
      ragPrompt,
      'SYMPTOM_CONSULTATION',
      [],
      { audience: 'STAFF' }
    );

    const draftReply = formatCustomerEmailSafeDraft(ragResult.answer);

    res.json({
      success: true,
      data: {
        draftReply,
        rawAnswerWithCitations: ragResult.answer,
        citations: ragResult.citations,
        warnings: ragResult.warnings,
        suspectedCondition: ragResult.suspectedCondition,
        detectedRxSummary,
        modelUsed: ragResult.modelUsed,
        engine: ragResult.engine,
      },
    });
  } catch (error) {
    if (error instanceof AiServiceError) {
      res.status(error.statusCode).json({
        success: false,
        code: error.code,
        model: error.model,
        message: error.message,
      });
      return;
    }
    res.status(503).json({
      success: false,
      message: 'Dịch vụ AI tạm gián đoạn nên chưa tạo được gợi ý trả lời. Dược sĩ có thể dùng mẫu có sẵn hoặc tự soạn.',
    });
  }
};

/**
 * DƯỢC SĨ PHẢN HỒI LIÊN HỆ & GỬI GMAIL THẬT (PATCH /api/contacts/:id/reply)
 */
export const replyContact = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    const parsed = replySchema.safeParse(req.body);
    if (!parsed.success || isNaN(id) || id <= 0) {
      res.status(400).json({
        success: false,
        message: 'Nội dung phản hồi hoặc email người nhận không hợp lệ',
        errors: !parsed.success ? parsed.error.flatten().fieldErrors : undefined,
      });
      return;
    }

    const existing = await prisma.contact.findUnique({ where: { ContactID: id } });
    if (!existing) {
      res.status(404).json({
        success: false,
        message: 'Không tìm thấy phiếu tư vấn',
      });
      return;
    }

    const pharmacistName = req.user?.FullName || 'Dược sĩ PharmaCore';
    const overrideEmail = parsed.data.RecipientEmail?.trim();
    const targetEmail = overrideEmail || existing.Email;

    const mailResult = parsed.data.sendEmail
      ? await sendPharmacistConsultationReplyEmail({
          contactId: id,
          toEmail: targetEmail,
          patientName: existing.FullName,
          originalSubject: existing.Subject,
          originalMessage: existing.Message,
          replyNote: parsed.data.ReplyNote,
          pharmacistName,
          emailSubject: parsed.data.EmailSubject,
        })
      : {
          status: 'LOCAL_ONLY' as const,
          toEmail: targetEmail,
          messageId: null,
          error: null,
        };

    const updated = await prisma.contact.update({
      where: { ContactID: id },
      data: {
        ...(overrideEmail ? { Email: overrideEmail } : {}),
        ReplyNote: parsed.data.ReplyNote,
        RepliedByUserID: req.user?.UserID ?? null,
        RepliedByName: pharmacistName,
        RepliedAt: new Date(),
        ReplyEmailStatus: mailResult.status,
        ReplyEmailTo: mailResult.toEmail,
        ReplyEmailMessageId: mailResult.messageId,
        ReplyEmailError: mailResult.error,
        Status: 'REPLIED',
      },
    });

    const responseMsg =
      mailResult.status === 'SENT'
        ? `Đã lưu phản hồi và gửi Gmail thật tới ${mailResult.toEmail}`
        : mailResult.status === 'LOCAL_ONLY'
          ? 'Đã lưu phản hồi chuyên môn (chế độ chỉ lưu nội bộ)'
          : `Đã lưu phản hồi nội bộ; email chưa gửi được: ${mailResult.error}`;

    res.json({
      success: true,
      message: responseMsg,
      data: normalizeContactDto(updated),
      mailResult,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Lỗi khi phản hồi liên hệ',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};
