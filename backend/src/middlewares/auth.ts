import { UserRole } from '@prisma/client';
import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { prisma } from '../database/prisma';
import { HttpError } from '../utils/httpError';

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
}

export interface AuthRequest extends Request {
  user?: AuthUser;
}

export async function requireAuth(req: AuthRequest, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    next(new HttpError(401, 'Token requerido'));
    return;
  }
  try {
    const tokenUser = jwt.verify(header.slice(7), env.jwtSecret) as AuthUser;
    const activeUser = await prisma.user.findUnique({
      where: { id: tokenUser.id },
      select: { id: true, email: true, role: true },
    });
    if (!activeUser) {
      next(new HttpError(401, 'Usuario no disponible'));
      return;
    }
    req.user = { id: activeUser.id, email: activeUser.email, role: activeUser.role };
    next();
  } catch {
    next(new HttpError(401, 'Token inválido o vencido'));
  }
}

export function requireRole(...roles: UserRole[]) {
  return (req: AuthRequest, _res: Response, next: NextFunction) => {
    if (!req.user) {
      next(new HttpError(401, 'Token requerido'));
      return;
    }
    if (req.user.role === 'SUPERADMIN' || roles.includes(req.user.role)) {
      next();
      return;
    }
    next(new HttpError(403, 'No tenés permisos para esta acción'));
  };
}
