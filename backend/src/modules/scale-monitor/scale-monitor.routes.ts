import { Router } from 'express';
import multer from 'multer';
import { requireAuth, requireRole } from '../../middlewares/auth';
import * as controller from './scale-monitor.controller';

export const scaleMonitorRoutes = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

scaleMonitorRoutes.use(requireAuth);
scaleMonitorRoutes.use(requireRole('SUPERADMIN', 'ADMIN'));

// Scale sources
scaleMonitorRoutes.get('/scale-sources', controller.listSources);
scaleMonitorRoutes.post('/scale-sources', controller.createSource);
scaleMonitorRoutes.patch('/scale-sources/:id', controller.updateSource);
scaleMonitorRoutes.delete('/scale-sources/:id', controller.deleteSource);

// CCT normative sources
scaleMonitorRoutes.get('/cct-sources', controller.listCctSources);
scaleMonitorRoutes.post('/cct-sources', controller.createCctSource);
scaleMonitorRoutes.patch('/cct-sources/:id', controller.updateCctSource);

// Monitor runs
scaleMonitorRoutes.get('/scale-monitor/runs', controller.listMonitorRuns);
scaleMonitorRoutes.get('/scale-monitor/diagnostic/:sourceId', controller.getSourceDiagnostic);
scaleMonitorRoutes.post('/scale-monitor/test-detection', controller.testDetection);
scaleMonitorRoutes.post('/scale-monitor/run', controller.runAllMonitors);
scaleMonitorRoutes.post('/scale-monitor/run/:sourceId', controller.runSourceMonitor);
scaleMonitorRoutes.post('/scale-monitor/cct-run/:sourceId', controller.runCctSourceMonitor);

// Candidates — rutas estáticas ANTES de las dinámicas (:id)
scaleMonitorRoutes.get('/scale-candidates', controller.listCandidates);
scaleMonitorRoutes.post('/scale-candidates/upload', upload.single('file'), controller.uploadManualScale);
scaleMonitorRoutes.post('/scale-candidates/dedup', controller.deduplicateCandidates);
scaleMonitorRoutes.delete('/scale-candidates/purge', controller.purgeCandidates);
scaleMonitorRoutes.get('/scale-candidates/:id', controller.getCandidate);
scaleMonitorRoutes.post('/scale-candidates/:id/approve', controller.approveCandidate);
scaleMonitorRoutes.post('/scale-candidates/:id/reject', controller.rejectCandidate);
scaleMonitorRoutes.post('/scale-candidates/:id/retrigger', controller.retriggerExtraction);

// Scale versions
scaleMonitorRoutes.get('/scale-versions', controller.listScaleVersions);
scaleMonitorRoutes.get('/scale-versions/history/:calculatorKey', controller.getScaleVersionHistory);

// CCT changes
scaleMonitorRoutes.get('/cct-changes', controller.listCctChanges);
scaleMonitorRoutes.post('/cct-changes/:id/approve', controller.approveCctChange);
scaleMonitorRoutes.post('/cct-changes/:id/reject', controller.rejectCctChange);
