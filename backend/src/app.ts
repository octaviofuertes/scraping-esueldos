import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import { env } from './config/env';
import { prisma } from './database/prisma';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler';
import { requireAuth, requireRole } from './middlewares/auth';
import { authRoutes } from './modules/auth/auth.routes';
import { scaleMonitorRoutes } from './modules/scale-monitor/scale-monitor.routes';
import { asyncHandler } from './utils/asyncHandler';
import { getApprovedSalaryScale, listSupportedConventions } from './modules/salary-scales/scale-helpers';

export const app = express();

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || env.corsOrigins.includes(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`Origen no permitido por CORS: ${origin}`));
    },
    credentials: true,
  }),
);
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));
app.use('/uploads', express.static(path.resolve(env.uploadDir)));

app.get('/api/health', async (_req, res) => {
  let database = 'down';
  try {
    await prisma.$queryRaw`SELECT 1`;
    database = 'up';
  } catch {
    database = env.databaseUrl ? 'configured_but_unreachable' : 'missing DATABASE_URL';
  }
  res.json({ name: 'Scraping eSueldos API', status: database === 'up' ? 'ok' : 'degraded', node: process.version, database });
});

app.use('/api/auth', authRoutes);

// Convenios soportados (catálogo)
app.get('/api/conventions', requireAuth, asyncHandler(async (_req, res) => {
  res.json(listSupportedConventions());
}));

// Escala aprobada vigente (lo que consumiría una calculadora) — demo de "cómo trae los datos"
app.get(
  '/api/approved-scale/:calculatorKey',
  requireAuth,
  requireRole('ADMIN', 'SUPERADMIN'),
  asyncHandler(async (req, res) => {
    res.json(await getApprovedSalaryScale(req.params.calculatorKey, Number(req.query.month), Number(req.query.year)));
  }),
);

// Módulo de scraping/monitoreo (mismas rutas que el sistema original, bajo /api/admin)
app.use('/api/admin', scaleMonitorRoutes);

app.use(notFoundHandler);
app.use(errorHandler);
