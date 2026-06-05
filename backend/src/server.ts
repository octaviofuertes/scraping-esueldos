import { env } from './config/env';
import { prisma } from './database/prisma';
import { app } from './app';
import { startScaleScheduler } from './modules/scale-monitor/scale-scheduler';

const server = app.listen(env.port, () => {
  console.log(`Scraping eSueldos API escuchando en http://localhost:${env.port}`);
  startScaleScheduler();
});

async function shutdown() {
  await prisma.$disconnect();
  server.close(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
