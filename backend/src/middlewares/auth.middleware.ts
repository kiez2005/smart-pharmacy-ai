import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config/env';

export interface AuthUserPayload {
  UserID: number;
  Email: string;
  Role: string;
  FullName?: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUserPayload;
    }
  }
}

/**
 * Middleware xác thực JWT Bearer Token
 * Trả về 401 nếu thiếu token hoặc token không hợp lệ / hết hạn
 */
export const authenticateToken = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    res.status(401).json({
      success: false,
      message: 'Yêu cầu phiên đăng nhập (Thiếu Bearer Token). Vui lòng đăng nhập lại!',
    });
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthUserPayload;
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({
      success: false,
      message: 'Phiên làm việc không hợp lệ hoặc đã hết hạn. Vui lòng đăng nhập lại!',
      error: error instanceof Error ? error.message : 'Invalid token',
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
