import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 4100),
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET ?? 'scraping-esueldos-demo-secret',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '8h',
  geminiApiKey: process.env.GEMINI_API_KEY,
  geminiModel: process.env.GEMINI_MODEL ?? 'gemini-2.5-flash',
  uploadDir: path.resolve(process.cwd(), process.env.UPLOAD_DIR ?? 'uploads'),
  superadminEmail: process.env.SUPERADMIN_EMAIL ?? 'admin@demo.com',
  superadminPassword: process.env.SUPERADMIN_PASSWORD ?? 'admin123',
  corsOrigins: (process.env.CORS_ORIGIN ?? 'http://localhost:4300,http://127.0.0.1:4300')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
};
