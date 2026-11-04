import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../config/prisma';

const contactSchema = z.object({
  FullName: z.string().trim().min(2, 'Vui lòng nhập họ tên'),
  Email: z.string().trim().email('Email không hợp lệ'),
  Phone: z.string().trim().min(8, 'Số điện thoại không hợp lệ'),
  Subject: z.string().trim().min(3, 'Vui lòng nhập tiêu đề cần tư vấn'),
  Message: z.string().trim().min(5, 'Vui lòng nhập nội dung triệu chứng / câu hỏi'),
});

const replySchema = z.object({
  ReplyNote: z.string().trim().min(2, 'Vui lòng nhập nội dung phản hồi của dược sĩ'),
});

/**
 * LẤY DANH SÁCH LIÊN HỆ TƯ VẤN (GET /api/contacts)
 */
export const getContacts = async (_req: Request, res: Response): Promise<void> => {
  try {
    const contacts = await prisma.contact.findMany({
      orderBy: { CreateDate: 'desc' },
    });
    res.json({ success: true, data: contacts });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Lỗi khi tải danh sách liên hệ tư vấn',
      error: error instanceof Error ? error.message : 'Unknown error',
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

    const created = await prisma.contact.create({
      data: parsed.data,
    });

    res.status(201).json({
      success: true,
      message: 'Đã gửi yêu cầu tư vấn tới Dược sĩ thành công',
      data: created,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Lỗi khi gửi liên hệ',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * DƯỢC SĨ PHẢN HỒI LIÊN HỆ (PATCH /api/contacts/:id/reply)
 */
export const replyContact = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    const parsed = replySchema.safeParse(req.body);
    if (!parsed.success || isNaN(id)) {
      res.status(400).json({
        success: false,
        message: 'Nội dung phản hồi không hợp lệ',
      });
      return;
    }

    const updated = await prisma.contact.update({
      where: { ContactID: id },
      data: {
        ReplyNote: parsed.data.ReplyNote,
        Status: 'REPLIED',
      },
    });

    res.json({
      success: true,
      message: 'Đã lưu phản hồi tư vấn của Dược sĩ',
      data: updated,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Lỗi khi phản hồi liên hệ',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};
