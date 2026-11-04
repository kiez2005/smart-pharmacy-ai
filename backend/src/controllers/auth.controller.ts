import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { prisma } from '../config/prisma';

const JWT_SECRET = process.env.JWT_SECRET || 'smart_pharmacy_d18cnpm5_secret_key_2026';

const registerSchema = z.object({
  FullName: z.string().trim().min(2, 'Họ tên phải có ít nhất 2 ký tự'),
  Email: z.string().trim().email('Email không hợp lệ'),
  Password: z.string().min(6, 'Mật khẩu phải có ít nhất 6 ký tự'),
  Phone: z.string().trim().optional().default(''),
  Role: z.enum(['ADMIN', 'PHARMACIST', 'CUSTOMER']).optional().default('PHARMACIST'),
});

const loginSchema = z.object({
  Email: z.string().trim().email('Email không hợp lệ'),
  Password: z.string().min(1, 'Vui lòng nhập mật khẩu'),
});

/**
 * FORM ĐĂNG KÝ TÀI KHOẢN (POST /api/auth/register)
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

    const { FullName, Email, Password, Phone, Role } = parsed.data;
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
        Role,
      },
    });

    const token = jwt.sign(
      { UserID: user.UserID, Email: user.Email, Role: user.Role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      success: true,
      message: 'Đăng ký tài khoản thành công',
      data: {
        token,
        user: {
          UserID: user.UserID,
          FullName: user.FullName,
          Email: user.Email,
          Phone: user.Phone,
          Role: user.Role,
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

    const token = jwt.sign(
      { UserID: user.UserID, Email: user.Email, Role: user.Role },
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
