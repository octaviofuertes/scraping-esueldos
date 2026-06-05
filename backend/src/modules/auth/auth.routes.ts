import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import { prisma } from '../../database/prisma';
import { asyncHandler } from '../../utils/asyncHandler';
import { HttpError } from '../../utils/httpError';
import { AuthRequest, requireAuth } from '../../middlewares/auth';

export const authRoutes = Router();

authRoutes.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { email, password } = req.body as { email?: string; password?: string };
    if (!email || !password) throw new HttpError(400, 'Email y contraseña requeridos');

    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new HttpError(401, 'Credenciales inválidas');
    }
    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, env.jwtSecret, { expiresIn: env.jwtExpiresIn } as any);
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  }),
);

authRoutes.get(
  '/me',
  requireAuth,
  asyncHandler(async (req: AuthRequest, res) => {
    res.json({ user: req.user });
  }),
);
