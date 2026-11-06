import { Request, Response } from 'express';
import { z } from 'zod';
import { aiGatewayService } from '../services/ai.service';

const diagnoseSchema = z.object({
  message: z.string().trim().min(2, 'Vui lòng mô tả triệu chứng hoặc câu hỏi tư vấn'),
});

/**
 * 1. API QUÉT ẢNH ĐƠN THUỐC BẰNG OPENCV + OCR (POST /api/ai/ocr-prescription)
 */
export const ocrPrescription = async (req: Request, res: Response): Promise<void> => {
  try {
    const isDemo = req.body?.isDemo === true || req.body?.isDemo === 'true';
    const presetHint = String(req.body?.presetHint || '');

    if (!req.file && !isDemo && !presetHint.trim()) {
      res.status(400).json({
        success: false,
        message: 'Vui lòng chọn ảnh đơn thuốc thực tế hoặc chọn mẫu đơn demo.',
      });
      return;
    }

    const buffer = req.file ? req.file.buffer : Buffer.from('demo-prescription-image');
    const filename = req.file ? req.file.originalname : `${presetHint || 'don-thuoc-cam-cum'}.png`;

    const result = await aiGatewayService.processPrescriptionOcr(buffer, filename, presetHint, isDemo);

    res.json({
      success: true,
      message: 'Trích xuất đơn thuốc bằng AI OCR & đối chiếu tồn kho thành công',
      data: result,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error instanceof Error ? error.message : 'Không thể xử lý OCR đơn thuốc',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * 2. API CHẨN ĐOÁN SƠ BỘ TRIỆU CHỨNG & CHATBOT TƯ VẤN THUỐC (POST /api/ai/diagnose-chat)
 */
export const diagnoseChat = async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = diagnoseSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: 'Vui lòng nhập triệu chứng cần tư vấn',
        errors: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const result = await aiGatewayService.diagnoseAndRecommend(parsed.data.message);
    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Lỗi khi phân tích triệu chứng bằng AI',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};
