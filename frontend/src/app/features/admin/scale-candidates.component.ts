import { Component, OnInit } from '@angular/core';
import { ApiService } from '../../core/api.service';

type CandidateStatus = 'DETECTED' | 'EXTRACTED' | 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | 'IGNORED';

interface ExtractedCategory {
  categoryKey?: string | null;
  categoryName: string;
  baseSalary?: number | null;
  nonRemunerativeAmount?: number | null;
  hourlyRate?: number | null;
}

interface DiffCategory {
  categoryKey: string;
  categoryName: string;
  previousBaseSalary: number | null;
  newBaseSalary: number | null;
  diffAmount: number | null;
  diffPct: number | null;
}

interface ScaleCandidate {
  id: string;
  conventionId: string;
  calculatorKey: string;
  sourceName: string;
  sourceUrl: string | null;
  documentUrl: string | null;
  fileName: string | null;
  fileHash: string | null;
  periodMonth: number | null;
  periodYear: number | null;
  title: string | null;
  status: CandidateStatus;
  aiConfidence: number;
  extractedText: string | null;
  extractedDataJson: {
    categories?: ExtractedCategory[];
    cctValues?: Record<string, number>;
    warnings?: string[];
    sourceEvidence?: string;
    previousVersionId?: string | null;
  };
  diffJson: {
    previousPeriod?: string;
    newPeriod?: string;
    categoriesModified?: DiffCategory[];
    categoriesAdded?: ExtractedCategory[];
    categoriesRemoved?: ExtractedCategory[];
    warnings?: string[];
  };
  createdAt: string;
  reviewedAt: string | null;
  reviewNotes: string | null;
  reviewedBy?: { name: string; email: string } | null;
  source?: { name: string; sourceType: string } | null;
}

interface PagedResult {
  total: number;
  page: number;
  limit: number;
  items: ScaleCandidate[];
}

@Component({
  selector: 'app-scale-candidates',
  template: `
    <div class="candidates-wrap">
      <div class="section-toolbar">
        <div>
          <h3>Escalas para revisar</h3>
          <p class="section-sub">Escalas detectadas por el monitor o cargadas manualmente. Revisalas antes de aprobar.</p>
        </div>
        <div class="toolbar-actions">
          <button class="btn-primary btn-sm" (click)="showManualUpload = !showManualUpload">
            {{ showManualUpload ? 'Cerrar carga manual' : '+ Cargar PDF manual' }}
          </button>
          <div class="cleanup-menu-wrap">
            <button class="btn-secondary btn-sm" (click)="toggleCleanMenu()" [disabled]="deduping || purging">
              🗑 Limpiar
            </button>
            <div class="cleanup-menu" *ngIf="showCleanMenu">
              <button (click)="dedup()">Duplicados (mismo PDF)</button>
              <button (click)="purge('errors')">Con error de IA</button>
              <button (click)="purge('rejected')">Rechazados / ignorados</button>
              <button (click)="purge('pending')">Pendientes sin aprobar</button>
              <button class="danger" (click)="purge('all')">Borrar todo (empezar de cero)</button>
            </div>
          </div>
        </div>
      </div>

      <app-manual-upload *ngIf="showManualUpload" (uploaded)="onManualUploaded()"></app-manual-upload>

      <div class="dedup-msg" *ngIf="dedupMsg">{{ dedupMsg }}</div>

      <!-- Filters -->
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
          <option value="IGNORED">Ignorado</option>
        </select>
        <select [(ngModel)]="filter.periodYear" (change)="onFilter()">
          <option value="">Todos los años</option>
          <option *ngFor="let y of years" [value]="y">{{ y }}</option>
        </select>
      </div>

      <!-- Tabs -->
      <div class="tab-bar">
        <button *ngFor="let t of tabs" class="tab-btn" [class.active]="filter.status === t.status" (click)="setTab(t.status)">
          {{ t.label }}
          <span class="tab-count" *ngIf="t.status === filter.status">{{ total }}</span>
        </button>
      </div>

      <!-- Cards -->
      <div class="candidates-grid">
        <div *ngFor="let c of candidates" class="candidate-card" (click)="openDetail(c)">
          <div class="candidate-card-header">
            <span class="conv-badge">{{ conventionLabel(c.calculatorKey) }}</span>
            <span class="status-badge status-{{ c.status.toLowerCase() }}">{{ statusLabel(c.status) }}</span>
          </div>
          <div class="candidate-card-body">
            <strong>{{ periodLabel(c.periodMonth, c.periodYear) }}</strong>
            <span class="source-name">{{ c.sourceName }}</span>
            <p class="candidate-title" *ngIf="c.title">{{ c.title }}</p>
          </div>
          <div class="candidate-card-meta">
            <span *ngIf="!hasAiError(c)" class="confidence-chip"
              [class.conf-high]="c.aiConfidence >= 80"
              [class.conf-med]="c.aiConfidence >= 50 && c.aiConfidence < 80"
              [class.conf-low]="c.aiConfidence > 0 && c.aiConfidence < 50"
              [class.conf-pending]="c.aiConfidence === 0">
              {{ c.aiConfidence === 0 ? 'Sin analizar' : 'pIA ' + c.aiConfidence + '%' }}
            </span>
            <span *ngIf="hasAiError(c)" class="confidence-chip conf-error" [title]="getAiError(c)">
              ⚠ Error IA
            </span>
            <span>{{ safeLen(c.extractedDataJson.categories) }} categorías</span>
            <span>{{ c.createdAt | date:'dd/MM/yy' }}</span>
          </div>
        </div>
        <div *ngIf="!candidates.length && !loading" class="empty-state">
          <p>No hay escalas con este filtro.</p>
        </div>
      </div>

      <!-- Pagination -->
      <div class="pagination" *ngIf="total > filter.limit">
        <button (click)="prevPage()" [disabled]="filter.page <= 1">‹ Anterior</button>
        <span>{{ filter.page }} / {{ totalPages }}</span>
        <button (click)="nextPage()" [disabled]="filter.page >= totalPages">Siguiente ›</button>
      </div>
    </div>

    <!-- Detail panel -->
    <div class="modal-overlay" *ngIf="detail" (click)="closeDetail()">
      <div class="modal-panel modal-wide" (click)="$event.stopPropagation()">
        <div class="modal-header">
          <div>
            <h4>{{ conventionLabel(detail.calculatorKey) }} — {{ periodLabel(detail.periodMonth, detail.periodYear) }}</h4>
            <span class="status-badge status-{{ detail.status.toLowerCase() }}">{{ statusLabel(detail.status) }}</span>
          </div>
          <button class="modal-close" (click)="closeDetail()">✕</button>
        </div>

        <div class="detail-body">
          <!-- Meta info -->
          <div class="detail-section">
            <div class="meta-grid">
              <span><b>Fuente:</b> {{ detail.sourceName }}</span>
              <span><b>Confianza IA:</b> <span class="confidence-chip" [class.conf-high]="detail.aiConfidence >= 80" [class.conf-med]="detail.aiConfidence >= 50 && detail.aiConfidence < 80" [class.conf-low]="detail.aiConfidence < 50">{{ detail.aiConfidence }}%</span></span>
              <span *ngIf="detail.documentUrl"><b>Documento:</b> <a [href]="detail.documentUrl" target="_blank" rel="noopener">Abrir</a></span>
              <span *ngIf="detail.fileHash"><b>Hash:</b> <code>{{ detail.fileHash | slice:0:16 }}…</code></span>
            </div>
          </div>

          <!-- Error de IA (ej: rate limit 429) -->
          <div class="detail-section ai-error-section" *ngIf="hasAiError(detail)">
            <h5>Error en extracción IA</h5>
            <p class="ai-error-msg">{{ getAiError(detail) }}</p>
            <p class="ai-error-hint">Podés reintentar con el botón <b>Re-analizar con pIA</b> cuando la cuota de Gemini se recupere (normalmente en minutos).</p>
          </div>

          <!-- Warnings -->
          <div class="detail-section" *ngIf="detail.extractedDataJson.warnings?.length">
            <h5>Advertencias de pIA</h5>
            <ul class="warning-list">
              <li *ngFor="let w of detail.extractedDataJson.warnings">{{ w }}</li>
            </ul>
          </div>

          <!-- Categories table -->
          <div class="detail-section" *ngIf="safeLen(detail.extractedDataJson.categories) > 0">
            <h5>Categorías detectadas ({{ safeLen(detail.extractedDataJson.categories) }})</h5>
            <div class="table-wrap">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Categoría</th>
                    <th>Básico mensual</th>
                    <th>No remunerativo</th>
                    <th>Valor hora</th>
                  </tr>
                </thead>
                <tbody>
                  <tr *ngFor="let cat of detail.extractedDataJson.categories">
                    <td>{{ cat.categoryName }}</td>
                    <td>{{ fmt(cat.baseSalary) }}</td>
                    <td>{{ fmt(cat.nonRemunerativeAmount) }}</td>
                    <td>{{ fmt(cat.hourlyRate) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- Valores CCT -->
          <div class="detail-section" *ngIf="cctEntries(detail).length > 0">
            <h5>Valores CCT detectados ({{ cctEntries(detail).length }})</h5>
            <div class="cct-values-grid">
              <div *ngFor="let v of cctEntries(detail)" class="cct-value-item">
                <span class="cct-value-label">{{ v.label }}</span>
                <span class="cct-value-amount">{{ fmt(v.value) }}</span>
              </div>
            </div>
          </div>

          <!-- Diff section -->
          <div class="detail-section" *ngIf="safeLen(detail.diffJson.categoriesModified) > 0 || safeLen(detail.diffJson.categoriesAdded) > 0">
            <h5>Diferencias vs versión anterior</h5>
            <div class="diff-meta">
              <span>Anterior: {{ detail.diffJson.previousPeriod }}</span>
              <span>Nuevo: {{ detail.diffJson.newPeriod }}</span>
            </div>
            <div class="table-wrap" *ngIf="safeLen(detail.diffJson.categoriesModified) > 0">
              <table class="data-table diff-table">
                <thead>
                  <tr><th>Categoría</th><th>Anterior</th><th>Nuevo</th><th>Diferencia</th><th>%</th></tr>
                </thead>
                <tbody>
                  <tr *ngFor="let d of detail.diffJson.categoriesModified">
                    <td>{{ d.categoryName }}</td>
                    <td>{{ fmt(d.previousBaseSalary) }}</td>
                    <td>{{ fmt(d.newBaseSalary) }}</td>
                    <td [class.diff-positive]="diffPositive(d.diffAmount)" [class.diff-negative]="diffNegative(d.diffAmount)">
                      {{ d.diffAmount != null ? diffSign(d.diffAmount) + fmt(d.diffAmount) : '—' }}
                    </td>
                    <td [class.diff-positive]="diffPositive(d.diffPct)">{{ d.diffPct != null ? diffSign(d.diffPct) + d.diffPct + '%' : '—' }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div *ngIf="safeLen(detail.diffJson.categoriesAdded) > 0" class="diff-new">
              <b>Categorías nuevas:</b> {{ categoryNames(detail.diffJson.categoriesAdded) }}
            </div>
            <div *ngIf="safeLen(detail.diffJson.categoriesRemoved) > 0" class="diff-removed">
              <b>Categorías eliminadas:</b> {{ categoryNames(detail.diffJson.categoriesRemoved) }}
            </div>
          </div>

          <!-- Review info -->
          <div class="detail-section" *ngIf="detail.reviewedBy">
            <p><b>Revisado por:</b> {{ detail.reviewedBy.name }} ({{ detail.reviewedBy.email }}) el {{ detail.reviewedAt | date:'dd/MM/yyyy HH:mm' }}</p>
            <p *ngIf="detail.reviewNotes"><b>Notas:</b> {{ detail.reviewNotes }}</p>
          </div>

          <!-- Notes input -->
          <div class="detail-section" *ngIf="detail.status === 'PENDING_REVIEW' || detail.status === 'DETECTED'">
            <label>Notas de revisión (opcional)
              <textarea [(ngModel)]="reviewNotes" rows="2" placeholder="Observaciones para el historial..."></textarea>
            </label>
            <label class="label-checkbox" *ngIf="detail.aiConfidence < 60 || hasNullCategories(detail)">
              <input type="checkbox" [(ngModel)]="overrideConfirm"/>
              Confirmo que quiero aprobar con confianza baja / datos incompletos
            </label>
          </div>
        </div>

        <div class="modal-footer" *ngIf="detail.status === 'PENDING_REVIEW' || detail.status === 'DETECTED' || detail.status === 'EXTRACTED'">
          <button class="btn-secondary" (click)="retrigger(detail)" [disabled]="acting">Re-analizar con pIA</button>
          <button class="btn-danger" (click)="reject(detail)" [disabled]="acting">Rechazar</button>
          <button class="btn-primary" (click)="approve(detail)" [disabled]="acting">Aprobar escala</button>
        </div>
      </div>
    </div>
  `,
})
export class ScaleCandidatesComponent implements OnInit {
  candidates: ScaleCandidate[] = [];
  total = 0;
  loading = false;
  acting = false;
  deduping = false;
  purging = false;
  dedupMsg = '';
  showCleanMenu = false;
  showManualUpload = false;
  detail: ScaleCandidate | null = null;
  reviewNotes = '';
  overrideConfirm = false;

  filter = { calculatorKey: '', status: 'PENDING_REVIEW' as CandidateStatus | '', periodYear: 0, page: 1, limit: 20 };

  tabs = [
    { label: 'Pendientes', status: 'PENDING_REVIEW' as CandidateStatus | '' },
    { label: 'Detectadas', status: 'DETECTED' as CandidateStatus | '' },
    { label: 'Aprobadas', status: 'APPROVED' as CandidateStatus | '' },
    { label: 'Rechazadas', status: 'REJECTED' as CandidateStatus | '' },
    { label: 'Todas', status: '' as CandidateStatus | '' },
  ];

  years = [2025, 2026, 2027];
  conventions = [
    { key: 'camioneros', label: 'Camioneros' },
    { key: 'metalurgicos', label: 'Metalúrgicos' },
    { key: 'comercio', label: 'Comercio' },
    { key: 'uocra', label: 'UOCRA' },
    { key: 'gastronomia', label: 'Gastronomía' },
    { key: 'farmacia', label: 'Farmacia' },
  ];

  get totalPages() { return Math.ceil(this.total / this.filter.limit) || 1; }

  constructor(private api: ApiService) {}

  ngOnInit() { this.load(); }

  load() {
    this.loading = true;
    const params: Record<string, string | number> = { page: this.filter.page, limit: this.filter.limit };
    if (this.filter.calculatorKey) params['calculatorKey'] = this.filter.calculatorKey;
    if (this.filter.status) params['status'] = this.filter.status;
    if (this.filter.periodYear) params['periodYear'] = this.filter.periodYear;

    const qs = Object.entries(params).map(([k, v]) => `${k}=${v}`).join('&');
    this.api.get<PagedResult>(`/admin/scale-candidates?${qs}`).subscribe({
      next: (r) => { this.candidates = r.items; this.total = r.total; this.loading = false; },
      error: () => { this.loading = false; },
    });
  }

  onFilter() { this.filter.page = 1; this.load(); }
  setTab(s: CandidateStatus | '') { this.filter.status = s; this.filter.page = 1; this.load(); }
  prevPage() { this.filter.page--; this.load(); }
  nextPage() { this.filter.page++; this.load(); }

  openDetail(c: ScaleCandidate) {
    this.reviewNotes = '';
    this.overrideConfirm = false;
    this.api.get<ScaleCandidate>(`/admin/scale-candidates/${c.id}`).subscribe({
      next: (full) => { this.detail = full; },
    });
  }

  closeDetail() { this.detail = null; }

  approve(c: ScaleCandidate) {
    if (!confirm('¿Confirmar aprobación de esta escala salarial?')) return;
    this.acting = true;
    this.api.post(`/admin/scale-candidates/${c.id}/approve`, { notes: this.reviewNotes, overrideLowConfidence: this.overrideConfirm }).subscribe({
      next: () => { this.acting = false; this.closeDetail(); this.load(); },
      error: (err) => { this.acting = false; alert(err?.error?.message ?? 'Error al aprobar'); },
    });
  }

  reject(c: ScaleCandidate) {
    if (!confirm('¿Rechazar esta escala detectada?')) return;
    this.acting = true;
    this.api.post(`/admin/scale-candidates/${c.id}/reject`, { notes: this.reviewNotes }).subscribe({
      next: () => { this.acting = false; this.closeDetail(); this.load(); },
      error: () => { this.acting = false; },
    });
  }

  retrigger(c: ScaleCandidate) {
    this.acting = true;
    this.api.post(`/admin/scale-candidates/${c.id}/retrigger`, {}).subscribe({
      next: (updated) => { this.acting = false; this.detail = updated as ScaleCandidate; },
      error: () => { this.acting = false; },
    });
  }

  toggleCleanMenu() { this.showCleanMenu = !this.showCleanMenu; }

  onManualUploaded() {
    // Tras cargar un PDF manual, refrescar la lista de pendientes
    this.filter.status = 'PENDING_REVIEW';
    this.filter.page = 1;
    this.load();
  }

  dedup() {
    this.showCleanMenu = false;
    if (!confirm('¿Marcar como ignorados los candidatos con el mismo PDF detectado más de una vez?')) return;
    this.deduping = true;
    this.dedupMsg = '';
    this.api.post<{ removed: number }>('/admin/scale-candidates/dedup', {}).subscribe({
      next: (r) => {
        this.deduping = false;
        this.dedupMsg = r.removed > 0 ? `Se limpiaron ${r.removed} duplicado(s).` : 'Sin duplicados.';
        this.load();
        setTimeout(() => { this.dedupMsg = ''; }, 4000);
      },
      error: () => { this.deduping = false; },
    });
  }

  purge(target: 'rejected' | 'errors' | 'pending' | 'all') {
    this.showCleanMenu = false;
    const labels: Record<string, string> = {
      rejected: 'rechazados e ignorados',
      errors: 'con error de IA',
      pending: 'pendientes sin aprobar (detectados, extraídos y pendientes)',
      all: 'todos (excepto los aprobados)',
    };
    if (!confirm(`¿Eliminar definitivamente todos los candidatos ${labels[target]}? Esta acción no se puede deshacer.`)) return;
    this.purging = true;
    this.dedupMsg = '';
    this.api.deleteWithQuery<{ removed: number }>('/admin/scale-candidates/purge', { target }).subscribe({
      next: (r) => {
        this.purging = false;
        this.dedupMsg = r.removed > 0 ? `Se eliminaron ${r.removed} candidato(s).` : 'No había candidatos para eliminar.';
        this.load();
        setTimeout(() => { this.dedupMsg = ''; }, 4000);
      },
      error: () => { this.purging = false; },
    });
  }

  hasNullCategories(c: ScaleCandidate): boolean {
    return (c.extractedDataJson.categories || []).some((cat) => cat.baseSalary == null && cat.hourlyRate == null);
  }

  safeLen(arr: unknown[] | undefined | null): number {
    return Array.isArray(arr) ? arr.length : 0;
  }

  categoryNames(arr: ExtractedCategory[] | undefined | null): string {
    return (arr || []).map((c) => c.categoryName).join(', ');
  }

  private readonly CCT_LABELS: Record<string, string> = {
    contribucionExtraordinaria: 'Contribución Extraordinaria',
    presentismoPct: 'Presentismo %',
    antiguedadPct: 'Antigüedad %',
    comidaDia: 'Comida por día',
    viaticoDia: 'Viático por día',
    pernoctada: 'Pernoctada',
    remunerativoKm: 'Rem. por Km',
    viaticoKm: 'Viático por Km',
    tituloFarmaceuticoBase: 'Título Farmacéutico (base)',
    tituloFarmaceuticoNoRem: 'Título Farmacéutico (no rem)',
    adscripcionBase: 'Adscripción (base)',
    adscripcionNoRem: 'Adscripción (no rem)',
    bloqueoBase: 'Bloqueo (base)',
    bloqueoNoRem: 'Bloqueo (no rem)',
    presentismoPct_gastronomia: 'Presentismo',
    alimentacionPct: 'Alimentación %',
  };

  cctEntries(c: ScaleCandidate): Array<{ label: string; value: number }> {
    const raw = (c.extractedDataJson as Record<string, unknown>)['cctValues'];
    if (!raw || typeof raw !== 'object') return [];
    const cct = raw as Record<string, unknown>;
    const result: Array<{ label: string; value: number }> = [];
    Object.keys(cct).forEach((key) => {
      const val = cct[key];
      if (typeof val === 'number' && val > 0) {
        result.push({ label: this.prettyCctLabel(key), value: val });
      }
    });
    return result.sort((a, b) => a.label.localeCompare(b.label));
  }

  private prettyCctLabel(key: string): string {
    if (this.CCT_LABELS[key]) return this.CCT_LABELS[key];
    // snake_case → "Snake case", camelCase → "Camel case", Pct → " %"
    let label = key
      .replace(/_/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/\bpct\b/gi, '%')
      .replace(/Pct$/i, ' %')
      .toLowerCase()
      .trim();
    return label.charAt(0).toUpperCase() + label.slice(1);
  }

  diffPositive(val: number | null | undefined): boolean { return typeof val === 'number' && val > 0; }
  diffNegative(val: number | null | undefined): boolean { return typeof val === 'number' && val < 0; }
  diffSign(val: number | null | undefined): string { return typeof val === 'number' && val > 0 ? '+' : ''; }
  fmt(val: number | null | undefined): string {
    if (val == null) return '—';
    return '$ ' + val.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }

  hasAiError(c: ScaleCandidate): boolean {
    return !!(c.extractedDataJson as Record<string, unknown>)['error'];
  }

  getAiError(c: ScaleCandidate): string {
    return String((c.extractedDataJson as Record<string, unknown>)['error'] || '');
  }

  statusLabel(s: CandidateStatus): string {
    const map: Record<CandidateStatus, string> = { DETECTED: 'Detectado', EXTRACTED: 'Extraído', PENDING_REVIEW: 'Pendiente', APPROVED: 'Aprobado', REJECTED: 'Rechazado', IGNORED: 'Ignorado' };
    return map[s] ?? s;
  }

  periodLabel(month: number | null, year: number | null): string {
    if (!month || !year) return 'Período desconocido';
    const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    return `${months[month - 1]} ${year}`;
  }

  conventionLabel(key: string): string {
    return this.conventions.find((c) => c.key === key)?.label ?? key;
  }
}
