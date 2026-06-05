import cron from 'node-cron';
import { runAllMonitors } from './scale-monitor.service';

let schedulerStarted = false;

export function startScaleScheduler() {
  if (schedulerStarted) return;
  schedulerStarted = true;

  // Run every 6 hours
  cron.schedule('0 */6 * * *', async () => {
    console.log('[ScaleScheduler] Iniciando monitoreo automático de escalas salariales...');
    try {
      const results = await runAllMonitors('scheduler');
      const found = results.reduce((sum, r) => sum + r.found, 0);
      console.log(`[ScaleScheduler] Monitoreo completado. Fuentes procesadas: ${results.length}. Documentos nuevos: ${found}.`);
    } catch (err) {
      console.error('[ScaleScheduler] Error en monitoreo automático:', err);
    }
  });

  console.log('[ScaleScheduler] Monitoreo automático de escalas iniciado (cada 6 horas).');
}
