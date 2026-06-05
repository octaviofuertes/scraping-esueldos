import { NextFunction, Request, Response } from 'express';
import { HttpError } from '../utils/httpError';

export function notFoundHandler(req: Request, _res: Response, next: NextFunction) {
  next(new HttpError(404, `Ruta no encontrada: ${req.method} ${req.originalUrl}`));
}

export function errorHandler(error: Error, _req: Request, res: Response, _next: NextFunction) {
  const maybePrisma = error as Error & { code?: string };
  const isDatabaseConnectionError =
    maybePrisma.code === 'P1001' ||
    error.name === 'PrismaClientInitializationError' ||
    error.message.includes("Can't reach database server");

  if (isDatabaseConnectionError) {
    res.status(503).json({
      error: { message: 'No se puede conectar con PostgreSQL. Verificá el servicio y DATABASE_URL en backend/.env.', code: 'DATABASE_UNAVAILABLE' },
    });
    return;
  }

  const statusCode = error instanceof HttpError ? error.statusCode : 500;
  const details = error instanceof HttpError ? error.details : undefined;
  res.status(statusCode).json({
    error: {
      message: statusCode === 500 ? 'Error interno del servidor' : error.message || 'Error interno del servidor',
      details,
    },
  });
}
