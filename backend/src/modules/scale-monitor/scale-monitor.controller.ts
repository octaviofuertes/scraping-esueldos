import { Response } from 'express';
import { AuthRequest } from '../../middlewares/auth';
import { asyncHandler } from '../../utils/asyncHandler';
import * as service from './scale-monitor.service';
import {
  approveCandidateSchema,
  createCctSourceSchema,
  createSourceSchema,
  listCandidatesQuerySchema,
  listCctChangesQuerySchema,
  listVersionsQuerySchema,
  reviewCandidateSchema,
  updateSourceSchema,
} from './scale-monitor.validation';

// ── Scale Sources ──────────────────────────────────────────────────────────────

export const listSources = asyncHandler(async (_req: AuthRequest, res: Response) => {
  res.json(await service.listScaleSources());
});

export const createSource = asyncHandler(async (req: AuthRequest, res: Response) => {
  const data = createSourceSchema.parse(req.body);
  res.status(201).json(await service.createScaleSource(req.user!, data));
});

export const updateSource = asyncHandler(async (req: AuthRequest, res: Response) => {
  const data = updateSourceSchema.parse(req.body);
  res.json(await service.updateScaleSource(req.user!, req.params.id, data));
});

export const deleteSource = asyncHandler(async (req: AuthRequest, res: Response) => {
  await service.deleteScaleSource(req.user!, req.params.id);
  res.json({ ok: true });
});

// ── CCT Normative Sources ──────────────────────────────────────────────────────

export const listCctSources = asyncHandler(async (_req: AuthRequest, res: Response) => {
  res.json(await service.listCctSources());
});

export const createCctSource = asyncHandler(async (req: AuthRequest, res: Response) => {
  const data = createCctSourceSchema.parse(req.body);
  res.status(201).json(await service.createCctSource(req.user!, data));
});

export const updateCctSource = asyncHandler(async (req: AuthRequest, res: Response) => {
  const data = updateSourceSchema.partial().parse(req.body);
  res.json(await service.updateCctSource(req.user!, req.params.id, data));
});

// ── Monitor Runs ───────────────────────────────────────────────────────────────

export const runAllMonitors = asyncHandler(async (req: AuthRequest, res: Response) => {
  const results = await service.runAllMonitors(req.user!.id);
  res.json({ results });
});

export const runSourceMonitor = asyncHandler(async (req: AuthRequest, res: Response) => {
  const result = await service.runSourceMonitor(req.params.sourceId, req.user!.id);
  res.json(result);
});

export const runCctSourceMonitor = asyncHandler(async (req: AuthRequest, res: Response) => {
  const result = await service.runCctSourceMonitor(req.params.sourceId, req.user!.id);
  res.json(result);
});

export const listMonitorRuns = asyncHandler(async (req: AuthRequest, res: Response) => {
  const sourceId = req.query.sourceId as string | undefined;
  res.json(await service.listMonitorRuns(sourceId));
});

export const getSourceDiagnostic = asyncHandler(async (req: AuthRequest, res: Response) => {
  res.json(await service.getSourceDiagnostic(req.params.sourceId));
});

export const testDetection = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { url } = req.body as { url: string };
  if (!url) { res.status(400).json({ message: 'url requerida' }); return; }
  const { detectDocumentsFromPage, extractPeriodFromText } = await import('./scale-extraction.service');
  const docs = await detectDocumentsFromPage(url);
  const toItem = (d: (typeof docs)[0]) => ({
    url: d.url.slice(0, 100),
    title: d.title.slice(0, 80),
    period: d.detectedPeriod ?? null,
    periodFromUrl: extractPeriodFromText(d.url),
  });
  res.json({
    total: docs.length,
    mostRecent: docs[0] ? toItem(docs[0]) : null,
    top5: docs.slice(0, 5).map(toItem),
  });
});

// ── Candidates ─────────────────────────────────────────────────────────────────

export const listCandidates = asyncHandler(async (req: AuthRequest, res: Response) => {
  const query = listCandidatesQuerySchema.parse(req.query);
  res.json(await service.listCandidates(query));
});

export const getCandidate = asyncHandler(async (req: AuthRequest, res: Response) => {
  res.json(await service.getCandidate(req.params.id));
});

export const approveCandidate = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { notes, overrideLowConfidence } = approveCandidateSchema.parse(req.body);
  await service.approveCandidate(req.user!, req.params.id, notes, overrideLowConfidence);
  res.json({ ok: true });
});

export const rejectCandidate = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { notes } = reviewCandidateSchema.parse(req.body);
  await service.rejectCandidate(req.user!, req.params.id, notes);
  res.json({ ok: true });
});

export const retriggerExtraction = asyncHandler(async (req: AuthRequest, res: Response) => {
  res.json(await service.retriggerExtraction(req.user!, req.params.id));
});

export const deduplicateCandidates = asyncHandler(async (req: AuthRequest, res: Response) => {
  res.json(await service.deduplicateCandidates(req.user!));
});

export const uploadManualScale = asyncHandler(async (req: AuthRequest, res: Response) => {
  const calculatorKey = String(req.body.calculatorKey ?? '');
  const file = (req as unknown as { file?: Express.Multer.File }).file;
  if (!file) { res.status(400).json({ message: 'Subí un archivo PDF.' }); return; }
  res.status(201).json(await service.uploadManualScale(req.user!, calculatorKey, file));
});

export const purgeCandidates = asyncHandler(async (req: AuthRequest, res: Response) => {
  const target = (req.query.target as string) || 'all';
  if (!['rejected', 'errors', 'pending', 'all'].includes(target)) {
    res.status(400).json({ message: 'target debe ser rejected, errors, pending o all' });
    return;
  }
  res.json(await service.purgeCandidates(req.user!, target as 'rejected' | 'errors' | 'pending' | 'all'));
});

// ── Scale Versions ─────────────────────────────────────────────────────────────

export const listScaleVersions = asyncHandler(async (req: AuthRequest, res: Response) => {
  const query = listVersionsQuerySchema.parse(req.query);
  res.json(await service.listScaleVersions(query));
});

export const getScaleVersionHistory = asyncHandler(async (req: AuthRequest, res: Response) => {
  res.json(await service.getScaleVersionHistory(req.params.calculatorKey));
});

// ── CCT Changes ────────────────────────────────────────────────────────────────

export const listCctChanges = asyncHandler(async (req: AuthRequest, res: Response) => {
  const query = listCctChangesQuerySchema.parse(req.query);
  res.json(await service.listCctChanges(query));
});

export const approveCctChange = asyncHandler(async (req: AuthRequest, res: Response) => {
  await service.approveCctChange(req.user!, req.params.id);
  res.json({ ok: true });
});

export const rejectCctChange = asyncHandler(async (req: AuthRequest, res: Response) => {
  await service.rejectCctChange(req.user!, req.params.id);
  res.json({ ok: true });
});
