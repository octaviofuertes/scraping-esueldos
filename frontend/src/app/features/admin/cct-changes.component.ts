import { Component, OnInit } from '@angular/core';
import { ApiService } from '../../core/api.service';

type ChangeStatus = 'DETECTED' | 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED';
type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';
type CctView = 'cambios' | 'fuentes';

interface CctChange {
  id: string;
  conventionId: string;
  calculatorKey: string;
  title: string;
  documentUrl: string | null;
  status: ChangeStatus;
  riskLevel: RiskLevel;
  aiConfidence: number;
  extractedText: string | null;
  summaryJson: {
    summary?: string;
    changes?: {
      salaryChanges?: string[];
      conditionChanges?: string[];
      newClauses?: string[];
      removedClauses?: string[];
    };
  };
  createdAt: string;
  reviewedAt: string | null;
  source?: { name: string } | null;
  reviewedBy?: { name: string; email: string } | null;
}

interface CctSource {
  id: string;
  conventionId: string;
  calculatorKey: string;
  name: string;
  url: string;
  enabled: boolean;
  lastCheckedAt: string | null;
  createdAt: string;
}

interface PagedResult {
  total: number;
  page: number;
  limit: number;
  items: CctChange[];
}

@Component({
  selector: 'app-cct-changes',
  template: `
    <div class="cct-changes-wrap">

      <!-- Header con sub-navegación -->
      <div class="section-toolbar">
        <div>
          <h3>Normativa CCT</h3>
          <p class="section-sub">
            {{ view === 'cambios'
              ? 'Documentos legales y actas paritarias detectados. Revisalos antes de marcar como leídos.'
              : 'Configurá de dónde el sistema buscará cambios normativos de cada convenio.' }}
          </p>
        </div>
        <div class="cct-subnav">
          <button class="subnav-btn" [class.active]="view === 'cambios'" (click)="setView('cambios')">
            Cambios detectados
            <span class="subnav-count" *ngIf="total && view === 'cambios'">{{ total }}</span>
          </button>
          <button class="subnav-btn" [class.active]="view === 'fuentes'" (click)="setView('fuentes')">
            Fuentes normativas
            <span class="subnav-count" *ngIf="sources.length && view === 'fuentes'">{{ sources.length }}</span>
          </button>
        </div>
      </div>

      <!-- ── VISTA: Cambios detectados ─────────────────────────────── -->
      <ng-container *ngIf="view === 'cambios'">

        <div class="filter-bar">
          <select [(ngModel)]="filter.calculatorKey" (change)="onFilter()">
            <option value="">Todos los convenios</option>
            <option *ngFor="let c of conventions" [value]="c.key">{{ c.label }}</option>
          </select>
          <select [(ngModel)]="filter.status" (change)="onFilter()">
            <option value="">Todos los estados</option>
            <option value="PENDING_REVIEW">Pendiente de revisión</option>
            <option value="DETECTED">Detectado</option>
            <option value="APPROVED">Aprobado</option>
            <option value="REJECTED">Rechazado</option>
          </select>
        </div>

        <div class="changes-list">
          <div *ngFor="let c of changes" class="change-card" (click)="openDetail(c)">
            <div class="change-card-header">
              <span class="conv-badge">{{ conventionLabel(c.calculatorKey) }}</span>
              <span class="risk-badge risk-{{ c.riskLevel.toLowerCase() }}">
                Riesgo {{ riskLabel(c.riskLevel) }}
              </span>
              <span class="status-badge status-{{ c.status.toLowerCase() }}">{{ statusLabel(c.status) }}</span>
            </div>
            <div class="change-card-body">
              <strong>{{ c.title }}</strong>
              <p *ngIf="c.summaryJson.summary" class="change-summary">
                {{ c.summaryJson.summary | slice:0:130 }}{{ (c.summaryJson.summary || '').length > 130 ? '…' : '' }}
              </p>
            </div>
            <div class="change-card-meta">
              <span class="confidence-chip"
                [class.conf-high]="c.aiConfidence >= 80"
                [class.conf-med]="c.aiConfidence >= 50 && c.aiConfidence < 80"
                [class.conf-low]="c.aiConfidence < 50">
                pIA {{ c.aiConfidence }}%
              </span>
              <span *ngIf="c.source">{{ c.source.name }}</span>
              <span>{{ c.createdAt | date:'dd/MM/yy' }}</span>
            </div>
          </div>

          <div *ngIf="!changes.length && !loading" class="empty-state">
            <p *ngIf="sources.length === 0">
              No hay fuentes normativas configuradas todavía.
              <button class="btn-link" (click)="setView('fuentes')">Agregar una fuente</button>
            </p>
            <p *ngIf="sources.length > 0">No hay cambios normativos con este filtro.</p>
          </div>
        </div>

        <div class="pagination" *ngIf="total > filter.limit">
          <button (click)="prevPage()" [disabled]="filter.page <= 1">‹ Anterior</button>
          <span>{{ filter.page }} / {{ totalPages }}</span>
          <button (click)="nextPage()" [disabled]="filter.page >= totalPages">Siguiente ›</button>
        </div>

      </ng-container>

      <!-- ── VISTA: Fuentes normativas ─────────────────────────────── -->
      <ng-container *ngIf="view === 'fuentes'">

        <div class="sources-toolbar">
          <p class="sources-help">
            Cada fuente es una página web que el sistema revisará periódicamente buscando
            actas, resoluciones o acuerdos paritarios del convenio. Cuando encuentre un
            documento nuevo, lo analizará con pIA y lo dejará pendiente de revisión.
          </p>
          <button class="btn-primary" (click)="openSourceForm(null)">+ Agregar fuente</button>
        </div>

        <div *ngIf="runMsg" class="run-results">
          <div class="run-result-item" [class.has-error]="runMsg.error">
            <strong>{{ runMsg.name }}</strong>
            <span *ngIf="!runMsg.error" class="badge badge-success">{{ runMsg.found }} nuevo(s)</span>
            <span *ngIf="runMsg.error" class="badge badge-danger">Error</span>
            <small *ngIf="runMsg.error">{{ runMsg.error }}</small>
          </div>
        </div>

        <div class="sources-grid" *ngIf="sources.length">
          <div *ngFor="let s of sources" class="source-card" [class.disabled-source]="!s.enabled">
            <div class="source-card-header">
              <span class="convention-badge">{{ conventionLabel(s.calculatorKey) }}</span>
              <div class="source-card-actions">
                <button class="btn-icon" title="Ejecutar ahora" (click)="runCctSource(s)" [disabled]="running">▶</button>
                <button class="btn-icon" title="Editar" (click)="openSourceForm(s)">✎</button>
              </div>
            </div>
            <div class="source-card-body">
              <strong>{{ s.name }}</strong>
              <a [href]="s.url" target="_blank" rel="noopener" class="source-url">
                {{ s.url | slice:0:55 }}{{ s.url.length > 55 ? '…' : '' }}
              </a>
            </div>
            <div class="source-card-meta">
              <span *ngIf="s.lastCheckedAt" class="meta-ok">✓ {{ s.lastCheckedAt | date:'dd/MM/yy HH:mm' }}</span>
              <span *ngIf="!s.lastCheckedAt" class="meta-pending">Sin ejecutar</span>
              <span *ngIf="!s.enabled" class="meta-error">Desactivada</span>
            </div>
          </div>
        </div>

        <div *ngIf="!sources.length && !loadingSources" class="empty-state sources-empty">
          <p>No hay fuentes normativas configuradas.<br>Agregá una para que el sistema empiece a monitorear cambios de convenio.</p>
        </div>

      </ng-container>
    </div>

    <!-- ── Modal detalle de cambio ───────────────────────────────────── -->
    <div class="modal-overlay" *ngIf="detail" (click)="closeDetail()">
      <div class="modal-panel modal-wide" (click)="$event.stopPropagation()">
        <div class="modal-header">
          <div>
            <h4>{{ detail.title }}</h4>
            <div class="modal-header-badges">
              <span class="risk-badge risk-{{ detail.riskLevel.toLowerCase() }}">Riesgo {{ riskLabel(detail.riskLevel) }}</span>
              <span class="status-badge status-{{ detail.status.toLowerCase() }}">{{ statusLabel(detail.status) }}</span>
            </div>
          </div>
          <button class="modal-close" (click)="closeDetail()">✕</button>
        </div>

        <div class="detail-body">
          <div class="meta-grid">
            <span><b>Convenio:</b> {{ conventionLabel(detail.calculatorKey) }}</span>
            <span><b>Confianza pIA:</b>
              <span class="confidence-chip"
                [class.conf-high]="detail.aiConfidence >= 80"
                [class.conf-med]="detail.aiConfidence >= 50 && detail.aiConfidence < 80"
                [class.conf-low]="detail.aiConfidence < 50">
                {{ detail.aiConfidence }}%
              </span>
            </span>
            <span *ngIf="detail.documentUrl">
              <b>Documento:</b> <a [href]="detail.documentUrl" target="_blank" rel="noopener">Abrir ↗</a>
            </span>
            <span><b>Detectado:</b> {{ detail.createdAt | date:'dd/MM/yyyy HH:mm' }}</span>
          </div>

          <div class="detail-section" *ngIf="detail.summaryJson.summary">
            <h5>Resumen del cambio</h5>
            <p>{{ detail.summaryJson.summary }}</p>
          </div>

          <div class="detail-section" *ngIf="detail.summaryJson.changes">
            <ng-container *ngIf="detail.summaryJson.changes.salaryChanges?.length">
              <h5>Cambios salariales</h5>
              <ul class="change-list salary">
                <li *ngFor="let i of detail.summaryJson.changes.salaryChanges">{{ i }}</li>
              </ul>
            </ng-container>
            <ng-container *ngIf="detail.summaryJson.changes.conditionChanges?.length">
              <h5>Condiciones laborales</h5>
              <ul class="change-list condition">
                <li *ngFor="let i of detail.summaryJson.changes.conditionChanges">{{ i }}</li>
              </ul>
            </ng-container>
            <ng-container *ngIf="detail.summaryJson.changes.newClauses?.length">
              <h5>Cláusulas nuevas</h5>
              <ul class="change-list new-clause">
                <li *ngFor="let i of detail.summaryJson.changes.newClauses">{{ i }}</li>
              </ul>
            </ng-container>
            <ng-container *ngIf="detail.summaryJson.changes.removedClauses?.length">
              <h5>Cláusulas eliminadas</h5>
              <ul class="change-list removed">
                <li *ngFor="let i of detail.summaryJson.changes.removedClauses">{{ i }}</li>
              </ul>
            </ng-container>
          </div>

          <div class="detail-section" *ngIf="detail.extractedText">
            <h5>
              Texto extraído del documento
              <button class="btn-link" (click)="showText = !showText">
                {{ showText ? 'Ocultar' : 'Ver texto completo' }}
              </button>
            </h5>
            <pre *ngIf="showText" class="extracted-text">{{ detail.extractedText | slice:0:4000 }}</pre>
          </div>

          <div class="detail-section reviewed-by" *ngIf="detail.reviewedBy">
            <p>
              <b>Revisado por:</b> {{ detail.reviewedBy.name }} ({{ detail.reviewedBy.email }})
              el {{ detail.reviewedAt | date:'dd/MM/yyyy' }}
            </p>
          </div>
        </div>

        <div class="modal-footer" *ngIf="detail.status === 'PENDING_REVIEW' || detail.status === 'DETECTED'">
          <button class="btn-danger" (click)="reject(detail)" [disabled]="acting">Rechazar</button>
          <button class="btn-primary" (click)="approve(detail)" [disabled]="acting">
            Marcar como revisado y aprobado
          </button>
        </div>
      </div>
    </div>

    <!-- ── Modal fuente CCT ──────────────────────────────────────────── -->
    <div class="modal-overlay" *ngIf="showSourceForm" (click)="closeSourceForm()">
      <div class="modal-panel" (click)="$event.stopPropagation()">
        <div class="modal-header">
          <h4>{{ editSource ? 'Editar fuente normativa' : 'Nueva fuente normativa CCT' }}</h4>
          <button class="modal-close" (click)="closeSourceForm()">✕</button>
        </div>
        <form (ngSubmit)="saveSource()" class="modal-form">

          <label>Convenio
            <select [(ngModel)]="sourceForm.calculatorKey" name="calculatorKey" required>
              <option value="">Seleccioná un convenio</option>
              <option *ngFor="let c of conventions" [value]="c.key">{{ c.label }}</option>
            </select>
          </label>

          <label>Nombre de la fuente
            <input type="text" [(ngModel)]="sourceForm.name" name="name" required
              placeholder="Ej: FAECYS – Actas paritarias" />
          </label>

          <label>URL de la página a monitorear
            <input type="url" [(ngModel)]="sourceForm.url" name="url" required
              placeholder="https://..." />
            <small class="field-hint">
              Pegá la URL de la sección donde publican acuerdos, actas o resoluciones del convenio.
              El sistema revisará esta página periódicamente buscando documentos nuevos.
            </small>
          </label>

          <label class="label-checkbox">
            <input type="checkbox" [(ngModel)]="sourceForm.enabled" name="enabled" />
            Fuente activa
          </label>

          <div class="modal-footer">
            <button type="button" class="btn-secondary" (click)="closeSourceForm()">Cancelar</button>
            <button type="submit" class="btn-primary" [disabled]="savingSource">
              {{ savingSource ? 'Guardando…' : 'Guardar fuente' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  `,
})
export class CctChangesComponent implements OnInit {

  // ── sub-vista ──────────────────────────────────────────────────────────────
  view: CctView = 'cambios';

  // ── cambios ────────────────────────────────────────────────────────────────
  changes: CctChange[] = [];
  total = 0;
  loading = false;
  acting = false;
  detail: CctChange | null = null;
  showText = false;
  filter = { calculatorKey: '', status: 'PENDING_REVIEW' as ChangeStatus | '', page: 1, limit: 20 };

  // ── fuentes ────────────────────────────────────────────────────────────────
  sources: CctSource[] = [];
  loadingSources = false;
  running = false;
  runMsg: { name: string; found: number; error?: string } | null = null;
  showSourceForm = false;
  editSource: CctSource | null = null;
  savingSource = false;
  sourceForm = { conventionId: '', calculatorKey: '', name: '', url: '', enabled: true };

  // ── shared ─────────────────────────────────────────────────────────────────
  conventions = [
    { key: 'camioneros', id: 'camioneros_cct_40_89',    label: 'Camioneros' },
    { key: 'metalurgicos', id: 'metalurgicos_cct_260_75', label: 'Metalúrgicos' },
    { key: 'comercio',    id: 'comercio_cct_130_75',    label: 'Comercio' },
    { key: 'uocra',       id: 'uocra_cct_76_75',        label: 'UOCRA' },
    { key: 'gastronomia', id: 'gastronomia_cct_389_04', label: 'Gastronomía' },
    { key: 'farmacia',    id: 'farmacia_mendoza',        label: 'Farmacia' },
  ];

  get totalPages() { return Math.ceil(this.total / this.filter.limit) || 1; }

  constructor(private api: ApiService) {}

  ngOnInit() {
    this.loadChanges();
    this.loadSources();
  }

  // ── navegación ─────────────────────────────────────────────────────────────
  setView(v: CctView) { this.view = v; }

  // ── cambios ────────────────────────────────────────────────────────────────
  loadChanges() {
    this.loading = true;
    const params: Record<string, string | number> = { page: this.filter.page, limit: this.filter.limit };
    if (this.filter.calculatorKey) params['calculatorKey'] = this.filter.calculatorKey;
    if (this.filter.status)        params['status']        = this.filter.status;
    const qs = Object.entries(params).map(([k, v]) => `${k}=${v}`).join('&');
    this.api.get<PagedResult>(`/admin/cct-changes?${qs}`).subscribe({
      next: (r) => { this.changes = r.items; this.total = r.total; this.loading = false; },
      error: () => { this.loading = false; },
    });
  }

  onFilter()  { this.filter.page = 1; this.loadChanges(); }
  prevPage()  { this.filter.page--; this.loadChanges(); }
  nextPage()  { this.filter.page++; this.loadChanges(); }

  openDetail(c: CctChange)  { this.showText = false; this.detail = c; }
  closeDetail()             { this.detail = null; }

  approve(c: CctChange) {
    if (!confirm('¿Marcar este cambio normativo como revisado y aprobado?')) return;
    this.acting = true;
    this.api.post(`/admin/cct-changes/${c.id}/approve`, {}).subscribe({
      next: () => { this.acting = false; this.closeDetail(); this.loadChanges(); },
      error: () => { this.acting = false; },
    });
  }

  reject(c: CctChange) {
    if (!confirm('¿Rechazar este cambio normativo?')) return;
    this.acting = true;
    this.api.post(`/admin/cct-changes/${c.id}/reject`, {}).subscribe({
      next: () => { this.acting = false; this.closeDetail(); this.loadChanges(); },
      error: () => { this.acting = false; },
    });
  }

  // ── fuentes ────────────────────────────────────────────────────────────────
  loadSources() {
    this.loadingSources = true;
    this.api.get<CctSource[]>('/admin/cct-sources').subscribe({
      next: (d) => { this.sources = d; this.loadingSources = false; },
      error: () => { this.loadingSources = false; },
    });
  }

  openSourceForm(s: CctSource | null) {
    this.editSource = s;
    this.sourceForm = s
      ? { conventionId: s.conventionId, calculatorKey: s.calculatorKey, name: s.name, url: s.url, enabled: s.enabled }
      : { conventionId: '', calculatorKey: '', name: '', url: '', enabled: true };
    this.showSourceForm = true;
  }

  closeSourceForm() { this.showSourceForm = false; this.editSource = null; }

  saveSource() {
    const conv = this.conventions.find((c) => c.key === this.sourceForm.calculatorKey);
    const payload = { ...this.sourceForm, conventionId: conv?.id ?? this.sourceForm.calculatorKey };
    this.savingSource = true;
    const req = this.editSource
      ? this.api.patch<CctSource>(`/admin/cct-sources/${this.editSource.id}`, payload)
      : this.api.post<CctSource>('/admin/cct-sources', payload);
    req.subscribe({
      next: () => { this.savingSource = false; this.closeSourceForm(); this.loadSources(); },
      error: () => { this.savingSource = false; },
    });
  }

  runCctSource(s: CctSource) {
    this.running = true;
    this.runMsg = null;
    this.api.post<{ found: number }>(`/admin/scale-monitor/cct-run/${s.id}`, {}).subscribe({
      next: (r) => {
        this.running = false;
        this.runMsg = { name: s.name, found: r.found };
        this.loadSources();
        if (r.found > 0) this.loadChanges();
      },
      error: (err) => {
        this.running = false;
        this.runMsg = { name: s.name, found: 0, error: err?.error?.message ?? 'Error al ejecutar' };
      },
    });
  }

  // ── helpers ────────────────────────────────────────────────────────────────
  riskLabel(r: RiskLevel): string {
    const m: Record<RiskLevel, string> = { LOW: 'bajo', MEDIUM: 'medio', HIGH: 'alto' };
    return m[r] || r;
  }

  statusLabel(s: ChangeStatus): string {
    const m: Record<ChangeStatus, string> = { DETECTED: 'Detectado', PENDING_REVIEW: 'Pendiente', APPROVED: 'Aprobado', REJECTED: 'Rechazado' };
    return m[s] || s;
  }

  conventionLabel(key: string): string {
    return this.conventions.find((c) => c.key === key)?.label || key;
  }
}
