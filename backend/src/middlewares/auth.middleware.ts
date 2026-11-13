import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config/env';
import { prisma } from '../config/prisma';

export interface AuthUserPayload {
  UserID: number;
  Email: string;
  Role: string;
  FullName?: string;
  TokenVersion?: number;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUserPayload;
    }
  }
}

/**
 * Middleware xác thực JWT Bearer Token + kiểm tra trạng thái thực từ DB (A3)
 * Trả về 401 nếu thiếu token, token hết hạn, tài khoản bị khóa hoặc TokenVersion không khớp
 */
export const authenticateToken = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;

  if (!token) {
    res.status(401).json({
      success: false,
      code: 'UNAUTHORIZED',
      message: 'Yêu cầu phiên đăng nhập (Thiếu Bearer Token). Vui lòng đăng nhập lại!',
    });
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthUserPayload;
    const liveUser = await prisma.user.findUnique({
      where: { UserID: decoded.UserID },
      select: {
        UserID: true,
        Email: true,
        FullName: true,
        Role: true,
        Status: true,
        TokenVersion: true,
      },
    });

    if (!liveUser || liveUser.Status !== 'ACTIVE') {
      res.status(401).json({
        success: false,
        code: 'ACCOUNT_INACTIVE',
        message: 'Tài khoản đã bị vô hiệu hóa hoặc không còn tồn tại.',
      });
      return;
    }

    if ((decoded.TokenVersion ?? 0) !== liveUser.TokenVersion) {
      res.status(401).json({
        success: false,
        code: 'TOKEN_REVOKED',
        message: 'Phiên làm việc đã hết hiệu lực hoặc phân quyền vừa thay đổi. Vui lòng đăng nhập lại!',
      });
      return;
    }

    req.user = {
      UserID: liveUser.UserID,
      Email: liveUser.Email,
      FullName: liveUser.FullName,
      Role: liveUser.Role,
      TokenVersion: liveUser.TokenVersion,
    };
    next();
  } catch (error) {
    res.status(401).json({
      success: false,
      code: 'INVALID_TOKEN',
      message: 'Phiên làm việc không hợp lệ hoặc đã hết hạn. Vui lòng đăng nhập lại!',
    });
  }
};

/**
 * Middleware phân quyền vai trò (Role-Based Access Control)
 * Cho phép các vai trò nằm trong allowedRoles ('ADMIN', 'PHARMACIST', 'CASHIER')
 * Trả về 403 nếu không đủ thẩm quyền
 */
export const requireRoles = (allowedRoles: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'Chưa xác thực danh tính người dùng',
      });
      return;
    }

    if (!allowedRoles.includes(req.user.Role)) {
      res.status(403).json({
        success: false,
        message: `Bạn không có quyền thực hiện thao tác này (Yêu cầu vai trò: ${allowedRoles.join(', ')} - Vai trò hiện tại: ${req.user.Role})`,
      });
      return;
    }

    next();
  };
};
