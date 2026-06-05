import { Component, OnInit } from '@angular/core';
import { ApiService } from '../../core/api.service';

type SourceType = 'FEDERATION' | 'SINDICATO' | 'MINISTERIO' | 'BOLETIN' | 'MANUAL' | 'OTHER';

interface ScaleSource {
  id: string;
  conventionId: string;
  calculatorKey: string;
  name: string;
  url: string;
  sourceType: SourceType;
  enabled: boolean;
  checkFrequency: number;
  lastCheckedAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  createdAt: string;
  _count?: { candidates: number; monitorRuns: number };
}

interface RunResult {
  sourceId: string;
  sourceName: string;
  found: number;
  error?: string;
}

interface Diagnostic {
  source: ScaleSource;
  lastRun: {
    status: string;
    checkedAt: string;
    foundDocumentsCount: number;
    errorMessage: string | null;
    rawResultJson: {
      totalDetected?: number;
      mostRecentDetected?: { title: string; period: { month: number; year: number } | null } | null;
      processed?: Array<{ url: string; title: string; period: { month: number; year: number } | null }>;
    };
  } | null;
  candidatesByStatus: Record<string, number>;
  geminiConfigured: boolean;
}

interface DetectionTest {
  total: number;
  mostRecent: { url: string; title: string; period: { month: number; year: number } | null } | null;
  top5: Array<{ url: string; title: string; period: { month: number; year: number } | null; periodFromUrl: { month: number; year: number } | null }>;
}

@Component({
  selector: 'app-scale-sources',
  template: `
    <div class="scale-sources-wrap">
      <div class="section-toolbar">
        <div>
          <h3>Fuentes de monitoreo</h3>
          <p class="section-sub">Configurá de dónde el sistema buscará nuevas escalas salariales.</p>
        </div>
        <div class="toolbar-actions">
          <button class="btn-secondary" (click)="runAll()" [disabled]="running">
            {{ running ? 'Ejecutando...' : 'Ejecutar todas' }}
          </button>
          <button class="btn-primary" (click)="openForm(null)">+ Agregar fuente</button>
        </div>
      </div>

      <div *ngIf="runResults.length" class="run-results">
        <div *ngFor="let r of runResults" class="run-result-item" [class.has-error]="r.error">
          <strong>{{ r.sourceName }}</strong>
          <span *ngIf="!r.error" class="badge badge-success">{{ r.found }} nuevo(s)</span>
          <span *ngIf="r.error" class="badge badge-danger">Error</span>
          <small *ngIf="r.error">{{ r.error }}</small>
        </div>
      </div>

      <div class="sources-grid">
        <div *ngFor="let s of sources" class="source-card" [class.disabled-source]="!s.enabled">
          <div class="source-card-header">
            <span class="source-type-badge badge-{{ s.sourceType.toLowerCase() }}">{{ sourceTypeLabel(s.sourceType) }}</span>
            <span class="convention-badge">{{ conventionLabel(s.calculatorKey) }}</span>
            <div class="source-card-actions">
              <button class="btn-icon" title="Ejecutar ahora" (click)="runOne(s)" [disabled]="running">▶</button>
              <button class="btn-icon" title="Ver diagnóstico" (click)="openDiag(s)">🔍</button>
              <button class="btn-icon" title="Editar" (click)="openForm(s)">✎</button>
              <button class="btn-icon btn-icon-danger" title="Eliminar" (click)="deleteSource(s)">✕</button>
            </div>
          </div>
          <div class="source-card-body">
            <strong>{{ s.name }}</strong>
            <a [href]="s.url" target="_blank" rel="noopener" class="source-url">{{ s.url | slice:0:60 }}{{ s.url.length > 60 ? '…' : '' }}</a>
          </div>
          <div class="source-card-meta">
            <span>{{ (s._count && s._count.candidates) || 0 }} candidatos</span>
            <span>{{ (s._count && s._count.monitorRuns) || 0 }} ejecuciones</span>
            <span *ngIf="s.lastSuccessAt" class="meta-ok">✓ {{ s.lastSuccessAt | date:'dd/MM/yy HH:mm' }}</span>
            <span *ngIf="s.lastError" class="meta-error" [title]="s.lastError">⚠ Error</span>
            <span *ngIf="!s.lastCheckedAt" class="meta-pending">Sin ejecutar</span>
          </div>
        </div>
        <div *ngIf="!sources.length && !loading" class="empty-state">
          <p>No hay fuentes configuradas. Agregá una para comenzar el monitoreo.</p>
        </div>
      </div>
    </div>

    <!-- Modal form -->
    <div class="modal-overlay" *ngIf="showForm" (click)="closeForm()">
      <div class="modal-panel" (click)="$event.stopPropagation()">
        <div class="modal-header">
          <h4>{{ editSource ? 'Editar fuente' : 'Nueva fuente de monitoreo' }}</h4>
          <button class="modal-close" (click)="closeForm()">✕</button>
        </div>
        <form (ngSubmit)="saveSource()" class="modal-form">
          <label>Convenio
            <select [(ngModel)]="form.calculatorKey" name="calculatorKey" required>
              <option value="">Seleccioná un convenio</option>
              <option *ngFor="let c of conventions" [value]="c.key">{{ c.label }}</option>
            </select>
          </label>
          <label>Nombre de la fuente
            <input type="text" [(ngModel)]="form.name" name="name" required placeholder="Ej: FAECYS – Escalas salariales"/>
          </label>
          <label>URL
            <input type="url" [(ngModel)]="form.url" name="url" required placeholder="https://..."/>
          </label>
          <label>Tipo de fuente
            <select [(ngModel)]="form.sourceType" name="sourceType">
              <option value="FEDERATION">Federación / Cámara</option>
              <option value="SINDICATO">Sindicato</option>
              <option value="MINISTERIO">Ministerio / Organismo oficial</option>
              <option value="BOLETIN">Boletín oficial</option>
              <option value="MANUAL">Carga manual</option>
              <option value="OTHER">Otro</option>
            </select>
          </label>
          <label>Frecuencia de chequeo (horas)
            <input type="number" [(ngModel)]="form.checkFrequency" name="checkFrequency" min="1" max="720"/>
          </label>
          <label class="label-checkbox">
            <input type="checkbox" [(ngModel)]="form.enabled" name="enabled"/>
            Fuente activa
          </label>
          <div class="modal-footer">
            <button type="button" class="btn-secondary" (click)="closeForm()">Cancelar</button>
            <button type="submit" class="btn-primary" [disabled]="saving">{{ saving ? 'Guardando...' : 'Guardar' }}</button>
          </div>
        </form>
      </div>
    </div>

    <!-- Modal diagnóstico -->
    <div class="modal-overlay" *ngIf="diag" (click)="closeDiag()">
      <div class="modal-panel modal-wide" (click)="$event.stopPropagation()">
        <div class="modal-header">
          <div>
            <h4>Diagnóstico — {{ diag.source.name }}</h4>
            <div style="display:flex;gap:.5rem;margin-top:.3rem;flex-wrap:wrap">
              <span class="badge" [class.badge-success]="diag.geminiConfigured" [class.badge-danger]="!diag.geminiConfigured">
                pIA {{ diag.geminiConfigured ? 'configurada ✓' : 'SIN API KEY ✕' }}
              </span>
              <span *ngIf="diag.lastRun" class="badge" [class.badge-success]="diag.lastRun.status === 'SUCCESS'" [class.badge-danger]="diag.lastRun.status === 'FAILED'" [class.badge-warning]="diag.lastRun.status === 'RUNNING'">
                Último run: {{ diag.lastRun.status }}
              </span>
            </div>
          </div>
          <button class="modal-close" (click)="closeDiag()">✕</button>
        </div>

        <div class="detail-body">
          <div *ngIf="!diag.lastRun" class="empty-state"><p>Esta fuente nunca fue ejecutada.</p></div>

          <div class="detail-section" *ngIf="diag.lastRun">
            <h5>Último chequeo — {{ diag.lastRun.checkedAt | date:'dd/MM/yyyy HH:mm' }}</h5>
            <div class="meta-grid">
              <span><b>Estado:</b> {{ diag.lastRun.status }}</span>
              <span><b>Documentos nuevos creados:</b> {{ diag.lastRun.foundDocumentsCount }}</span>
              <span *ngIf="diag.lastRun.rawResultJson.totalDetected != null"><b>Detectados en página:</b> {{ diag.lastRun.rawResultJson.totalDetected }}</span>
              <span *ngIf="diag.lastRun.rawResultJson.mostRecentDetected"><b>Más reciente en página:</b> {{ diag.lastRun.rawResultJson.mostRecentDetected?.period?.month }}/{{ diag.lastRun.rawResultJson.mostRecentDetected?.period?.year }}</span>
            </div>
            <div *ngIf="diag.lastRun.errorMessage" class="ai-error-section" style="margin-top:.75rem">
              <h5>Error</h5>
              <p class="ai-error-msg">{{ diag.lastRun.errorMessage }}</p>
            </div>
          </div>

          <div class="detail-section" *ngIf="diag.lastRun && diag.lastRun.rawResultJson.processed?.length">
            <h5>Documentos procesados en ese run</h5>
            <ul class="diag-doc-list">
              <li *ngFor="let d of diag.lastRun.rawResultJson.processed">
                <span class="diag-doc-title">{{ d.title || d.url }}</span>
                <span *ngIf="d.period" class="diag-period">{{ d.period.month }}/{{ d.period.year }}</span>
                <span *ngIf="!d.period" class="diag-period-unknown">sin fecha detectada</span>
              </li>
            </ul>
          </div>

          <div class="detail-section">
            <h5>Candidatos de esta fuente</h5>
            <div class="meta-grid">
              <span *ngFor="let entry of diagEntries(diag.candidatesByStatus)">
                <b>{{ entry.status }}:</b> {{ entry.count }}
              </span>
              <span *ngIf="diagEntries(diag.candidatesByStatus).length === 0">Sin candidatos todavía</span>
            </div>
          </div>
        </div>

          <!-- Test detección en vivo -->
          <div class="detail-section">
            <h5>
              Probar detección ahora
              <button class="btn-link" (click)="testDetectionNow()" [disabled]="testingDetection">
                {{ testingDetection ? 'Analizando página…' : '▶ Ejecutar test' }}
              </button>
            </h5>
            <p style="font-size:.8rem;color:#64748b;margin:0 0 .5rem">
              Llama al scraper en tiempo real y muestra qué documentos y períodos detecta,
              sin descargar ni crear candidatos.
            </p>
            <div *ngIf="detectionTest" class="detection-test-result">
              <div class="meta-grid" style="margin-bottom:.75rem">
                <span><b>Links encontrados:</b> {{ detectionTest.total }}</span>
                <span *ngIf="detectionTest.mostRecent">
                  <b>Más reciente:</b>
                  <span class="diag-period" *ngIf="detectionTest.mostRecent.period">
                    {{ detectionTest.mostRecent.period.month }}/{{ detectionTest.mostRecent.period.year }}
                  </span>
                  <span class="diag-period-unknown" *ngIf="!detectionTest.mostRecent.period">sin período</span>
                </span>
              </div>
              <ul class="diag-doc-list">
                <li *ngFor="let d of detectionTest.top5">
                  <span class="diag-doc-title">{{ d.title || d.url }}</span>
                  <span class="diag-period" *ngIf="d.period">{{ d.period.month }}/{{ d.period.year }}</span>
                  <span class="diag-period" *ngIf="!d.period && d.periodFromUrl" style="background:#fef3c7;color:#92400e">URL: {{ d.periodFromUrl.month }}/{{ d.periodFromUrl.year }}</span>
                  <span class="diag-period-unknown" *ngIf="!d.period && !d.periodFromUrl">sin fecha</span>
                </li>
              </ul>
            </div>
          </div>

        <div class="modal-footer">
          <button class="btn-secondary" (click)="closeDiag()">Cerrar</button>
          <button class="btn-primary" (click)="runFromDiag()" [disabled]="running">
            {{ running ? 'Ejecutando…' : 'Ejecutar ahora' }}
          </button>
        </div>
      </div>
    </div>
  `,
})
export class ScaleSourcesComponent implements OnInit {
  sources: ScaleSource[] = [];
  loading = false;
  running = false;
  saving = false;
  showForm = false;
  editSource: ScaleSource | null = null;
  runResults: RunResult[] = [];
  diag: Diagnostic | null = null;
  diagSource: ScaleSource | null = null;
  detectionTest: DetectionTest | null = null;
  testingDetection = false;

  form = {
    conventionId: '',
    calculatorKey: '',
    name: '',
    url: '',
    sourceType: 'FEDERATION' as SourceType,
    enabled: true,
    checkFrequency: 24,
    monitorSince: this.currentMonthIso(),
  };

  conventions = [
    { key: 'camioneros', id: 'camioneros_cct_40_89', label: 'Camioneros CCT 40/89' },
    { key: 'metalurgicos', id: 'metalurgicos_cct_260_75', label: 'Metalúrgicos CCT 260/75' },
    { key: 'comercio', id: 'comercio_cct_130_75', label: 'Comercio CCT 130/75' },
    { key: 'uocra', id: 'uocra_cct_76_75', label: 'UOCRA CCT 76/75' },
    { key: 'gastronomia', id: 'gastronomia_cct_389_04', label: 'Gastronomía FEHGRA CCT 389/04' },
    { key: 'farmacia', id: 'farmacia_mendoza', label: 'Farmacia Mendoza CCT 429/05' },
  ];

  constructor(private api: ApiService) {}

  ngOnInit() { this.load(); }

  currentMonthIso(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  load() {
    this.loading = true;
    this.api.get<ScaleSource[]>('/admin/scale-sources').subscribe({
      next: (data) => { this.sources = data; this.loading = false; },
      error: () => { this.loading = false; },
    });
  }

  sourceTypeLabel(type: SourceType) {
    const labels: Record<SourceType, string> = { FEDERATION: 'Federación', SINDICATO: 'Sindicato', MINISTERIO: 'Ministerio', BOLETIN: 'Boletín', MANUAL: 'Manual', OTHER: 'Otro' };
    return labels[type] ?? type;
  }

  conventionLabel(key: string) {
    return this.conventions.find((c) => c.key === key)?.label.split(' ')[0] ?? key;
  }

  openForm(source: ScaleSource | null) {
    this.editSource = source;
    if (source) {
      const conv = this.conventions.find((c) => c.key === source.calculatorKey);
      this.form = {
        conventionId: conv?.id ?? source.conventionId,
        calculatorKey: source.calculatorKey,
        name: source.name,
        url: source.url,
        sourceType: source.sourceType,
        enabled: source.enabled,
        checkFrequency: source.checkFrequency,
        monitorSince: (source as any).monitorSince
          ? new Date((source as any).monitorSince).toISOString().slice(0, 7)
          : this.currentMonthIso(),
      };
    } else {
      this.form = { conventionId: '', calculatorKey: '', name: '', url: '', sourceType: 'FEDERATION', enabled: true, checkFrequency: 24, monitorSince: this.currentMonthIso() };
    }
    this.showForm = true;
  }

  closeForm() { this.showForm = false; this.editSource = null; }

  saveSource() {
    const conv = this.conventions.find((c) => c.key === this.form.calculatorKey);
    // Convertir "YYYY-MM" a ISO date (primer día del mes)
    const monitorSince = this.form.monitorSince ? `${this.form.monitorSince}-01T00:00:00.000Z` : undefined;
    const payload = { ...this.form, conventionId: conv?.id ?? this.form.calculatorKey, monitorSince };
    this.saving = true;
    const req = this.editSource
      ? this.api.patch<ScaleSource>(`/admin/scale-sources/${this.editSource.id}`, payload)
      : this.api.post<ScaleSource>('/admin/scale-sources', payload);
    req.subscribe({
      next: () => { this.saving = false; this.closeForm(); this.load(); },
      error: () => { this.saving = false; },
    });
  }

  deleteSource(s: ScaleSource) {
    if (!confirm(`¿Eliminar la fuente "${s.name}"?`)) return;
    this.api.delete(`/admin/scale-sources/${s.id}`).subscribe({ next: () => this.load() });
  }

  runOne(s: ScaleSource) {
    this.running = true;
    this.runResults = [];
    this.api.post<RunResult>(`/admin/scale-monitor/run/${s.id}`, {}).subscribe({
      next: (r) => { this.running = false; this.runResults = [r]; this.load(); },
      error: () => { this.running = false; },
    });
  }

  openDiag(s: ScaleSource) {
    this.diagSource = s;
    this.api.get<Diagnostic>(`/admin/scale-monitor/diagnostic/${s.id}`).subscribe({
      next: (d) => { this.diag = d; },
    });
  }

  closeDiag() { this.diag = null; this.diagSource = null; }

  runFromDiag() {
    if (!this.diagSource) return;
    const s = this.diagSource;
    this.running = true;
    this.api.post<RunResult>(`/admin/scale-monitor/run/${s.id}`, {}).subscribe({
      next: (r) => {
        this.running = false;
        this.runResults = [r];
        this.load();
        this.openDiag(s);
      },
      error: () => { this.running = false; },
    });
  }

  testDetectionNow() {
    if (!this.diagSource) return;
    this.testingDetection = true;
    this.detectionTest = null;
    this.api.post<DetectionTest>('/admin/scale-monitor/test-detection', { url: this.diagSource.url }).subscribe({
      next: (r) => { this.detectionTest = r; this.testingDetection = false; },
      error: () => { this.testingDetection = false; },
    });
  }

  diagEntries(map: Record<string, number>): Array<{ status: string; count: number }> {
    return Object.entries(map).map(([status, count]) => ({ status, count }));
  }

  runAll() {
    this.running = true;
    this.runResults = [];
    this.api.post<{ results: RunResult[] }>('/admin/scale-monitor/run', {}).subscribe({
      next: (r) => { this.running = false; this.runResults = r.results; this.load(); },
      error: () => { this.running = false; },
    });
  }
}
