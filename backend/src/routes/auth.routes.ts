import { Router } from 'express';
import { getMe, loginUser, logoutUser, registerUser } from '../controllers/auth.controller';
import { authenticateToken } from '../middlewares/auth.middleware';
import { authLimiter } from '../middlewares/rate-limit.middleware';

const router = Router();

// Public routes (rate-limited A4)
router.post('/register', authLimiter, registerUser);
router.post('/login', authLimiter, loginUser);

// Protected routes (A3 session validation & token revocation)
router.post('/logout', authenticateToken, logoutUser);
router.get('/me', authenticateToken, getMe);

export default router;
