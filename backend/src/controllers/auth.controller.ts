import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { prisma } from '../config/prisma';
import { JWT_SECRET } from '../config/env';

// Schema đăng ký tài khoản công khai: Bỏ hoàn toàn trường Role để chống leo thang đặc quyền
const registerSchema = z.object({
  FullName: z.string().trim().min(2, 'Họ tên phải có ít nhất 2 ký tự'),
  Email: z.string().trim().email('Email không hợp lệ'),
  Password: z.string().min(6, 'Mật khẩu phải có ít nhất 6 ký tự'),
  Phone: z.string().trim().optional().default(''),
});

const loginSchema = z.object({
  Email: z.string().trim().email('Email không hợp lệ'),
  Password: z.string().min(1, 'Vui lòng nhập mật khẩu'),
});

/**
 * FORM ĐĂNG KÝ TÀI KHOẢN (POST /api/auth/register)
 * Mọi tài khoản tạo mới mặc định nhận Role="CASHIER" và Status="INACTIVE" (Chờ Admin duyệt)
 */
export const registerUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: 'Thông tin đăng ký không hợp lệ',
        errors: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const { FullName, Email, Password, Phone } = parsed.data;
    const existing = await prisma.user.findUnique({ where: { Email } });
    if (existing) {
      res.status(409).json({
        success: false,
        message: 'Email này đã được đăng ký trong hệ thống',
      });
      return;
    }

    const hashedPassword = await bcrypt.hash(Password, 10);
    const user = await prisma.user.create({
      data: {
        FullName,
        Email,
        Password: hashedPassword,
        Phone,
        Role: 'CASHIER', // Quyền thấp nhất mặc định
        Status: 'INACTIVE', // Chờ Admin duyệt kích hoạt
      },
    });

    res.status(201).json({
      success: true,
      message:
        'Đăng ký tài khoản thành công! Tài khoản đang ở trạng thái chờ Quản trị viên kích hoạt trước khi có thể đăng nhập.',
      data: {
        user: {
          UserID: user.UserID,
          FullName: user.FullName,
          Email: user.Email,
          Phone: user.Phone,
          Role: user.Role,
          Status: user.Status,
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Lỗi máy chủ khi đăng ký tài khoản',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * FORM ĐĂNG NHẬP HỆ THỐNG (POST /api/auth/login)
 * Từ chối đăng nhập nếu tài khoản có Status !== 'ACTIVE'
 */
export const loginUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: 'Thông tin đăng nhập không hợp lệ',
        errors: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const { Email, Password } = parsed.data;
    const user = await prisma.user.findUnique({ where: { Email } });
    if (!user) {
      res.status(401).json({
        success: false,
        message: 'Email hoặc mật khẩu không chính xác',
      });
      return;
    }

    const isMatch = await bcrypt.compare(Password, user.Password);
    if (!isMatch) {
      res.status(401).json({
        success: false,
        message: 'Email hoặc mật khẩu không chính xác',
      });
      return;
    }

    // Kiểm tra trạng thái kích hoạt tài khoản
    if (user.Status !== 'ACTIVE') {
      res.status(403).json({
        success: false,
        message:
          'Tài khoản của bạn đang ở trạng thái chờ Quản trị viên kích hoạt hoặc đã bị khóa. Vui lòng liên hệ Admin!',
      });
      return;
    }

    const token = jwt.sign(
      {
        UserID: user.UserID,
        Email: user.Email,
        Role: user.Role,
        FullName: user.FullName,
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      message: 'Đăng nhập thành công',
      data: {
        token,
        user: {
          UserID: user.UserID,
          FullName: user.FullName,
          Email: user.Email,
          Phone: user.Phone,
          Role: user.Role,
          Status: user.Status,
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Lỗi máy chủ khi đăng nhập',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * LẤY THÔNG TIN TÀI KHOẢN ĐANG ĐĂNG NHẬP (GET /api/auth/me)
 */
export const getMe = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Chưa đăng nhập' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { UserID: req.user.UserID },
      select: {
        UserID: true,
        FullName: true,
        Email: true,
        Phone: true,
        Role: true,
        Status: true,
        CreateDate: true,
      },
    });

    if (!user) {
      res.status(404).json({ success: false, message: 'Không tìm thấy người dùng' });
      return;
    }

    res.json({ success: true, data: user });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Lỗi khi lấy thông tin người dùng',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};
