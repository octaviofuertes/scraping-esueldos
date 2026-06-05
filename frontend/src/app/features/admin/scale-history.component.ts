import { Component, OnInit } from '@angular/core';
import { ApiService } from '../../core/api.service';

interface ScaleItem {
  id: string;
  categoryKey: string | null;
  categoryName: string;
  baseSalary: number | null;
  hourlyWage: number | null;
  nonRemunerativeAmount: number | null;
}

interface ScaleVersion {
  id: string;
  conventionId: string;
  calculatorKey: string;
  conventionName: string;
  periodMonth: number;
  periodYear: number;
  status: string;
  sourceLabel: string;
  sourceUrl: string | null;
  confidenceScore: number;
  createdAt: string;
  approvedAt?: string | null;
  items: ScaleItem[];
}

@Component({
  selector: 'app-scale-history',
  template: `
    <div class="history-wrap">
      <div class="section-toolbar">
        <div>
          <h3>Historial de escalas aprobadas</h3>
          <p class="section-sub">Versiones vigentes e históricas por convenio y período.</p>
        </div>
      </div>

      <div class="history-filters">
        <select [(ngModel)]="selectedConvention" (change)="loadHistory()">
          <option value="">Seleccioná un convenio</option>
          <option *ngFor="let c of conventions" [value]="c.key">{{ c.label }}</option>
        </select>
        <select [(ngModel)]="selectedYear" (change)="onYearFilter()">
          <option value="">Todos los años</option>
          <option *ngFor="let y of years" [value]="y">{{ y }}</option>
        </select>
      </div>

      <div *ngIf="!selectedConvention" class="empty-state">
        <p>Seleccioná un convenio para ver su historial de escalas.</p>
      </div>

      <div *ngIf="selectedConvention && !loading">
        <div class="history-timeline">
          <div *ngFor="let v of filteredVersions" class="history-item" [class.history-active]="v.status === 'APROBADA'" (click)="openVersion(v)">
            <div class="history-dot" [class.dot-active]="v.status === 'APROBADA'" [class.dot-archived]="v.status === 'ARCHIVADA'"></div>
            <div class="history-content">
              <div class="history-head">
                <strong>{{ periodLabel(v.periodMonth, v.periodYear) }}</strong>
                <span class="status-badge" [class.badge-aprobada]="v.status === 'APROBADA'" [class.badge-archivada]="v.status === 'ARCHIVADA'">
                  {{ v.status === 'APROBADA' ? 'Vigente' : 'Archivada' }}
                </span>
              </div>
              <div class="history-meta">
                <span>{{ v.items.length }} categorías</span>
                <span>Confianza: {{ v.confidenceScore }}%</span>
                <span>Fuente: {{ v.sourceLabel }}</span>
                <span>{{ v.createdAt | date:'dd/MM/yy' }}</span>
              </div>
            </div>
          </div>
          <div *ngIf="!filteredVersions.length" class="empty-state">
            <p>No hay escalas registradas para este convenio{{ selectedYear ? ' en ' + selectedYear : '' }}.</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Version detail modal -->
    <div class="modal-overlay" *ngIf="openedVersion" (click)="closeVersion()">
      <div class="modal-panel modal-wide" (click)="$event.stopPropagation()">
        <div class="modal-header">
          <div>
            <h4>{{ conventionLabel(openedVersion.calculatorKey) }} — {{ periodLabel(openedVersion.periodMonth, openedVersion.periodYear) }}</h4>
            <span class="status-badge" [class.badge-aprobada]="openedVersion.status === 'APROBADA'" [class.badge-archivada]="openedVersion.status === 'ARCHIVADA'">
              {{ openedVersion.status === 'APROBADA' ? 'Vigente' : 'Archivada' }}
            </span>
          </div>
          <button class="modal-close" (click)="closeVersion()">✕</button>
        </div>
        <div class="detail-body">
          <div class="meta-grid">
            <span><b>Fuente:</b> {{ openedVersion.sourceLabel }}</span>
            <span><b>Confianza:</b> {{ openedVersion.confidenceScore }}%</span>
            <span *ngIf="openedVersion.sourceUrl"><b>Doc:</b> <a [href]="openedVersion.sourceUrl" target="_blank" rel="noopener">Abrir</a></span>
          </div>
          <div class="detail-section">
            <h5>Escala salarial ({{ openedVersion.items.length }} categorías)</h5>
            <div class="table-wrap">
              <table class="data-table">
                <thead>
                  <tr><th>Categoría</th><th>Básico mensual</th><th>No remunerativo</th><th>Valor hora</th></tr>
                </thead>
                <tbody>
                  <tr *ngFor="let item of openedVersion.items">
                    <td>{{ item.categoryName }}</td>
                    <td>{{ fmt(item.baseSalary) }}</td>
                    <td>{{ fmt(item.nonRemunerativeAmount) }}</td>
                    <td>{{ fmt(item.hourlyWage) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" (click)="closeVersion()">Cerrar</button>
        </div>
      </div>
    </div>
  `,
})
export class ScaleHistoryComponent implements OnInit {
  allVersions: ScaleVersion[] = [];
  filteredVersions: ScaleVersion[] = [];
  loading = false;
  selectedConvention = '';
  selectedYear = 0;
  openedVersion: ScaleVersion | null = null;

  conventions = [
    { key: 'camioneros', label: 'Camioneros CCT 40/89' },
    { key: 'metalurgicos', label: 'Metalúrgicos CCT 260/75' },
    { key: 'comercio', label: 'Comercio CCT 130/75' },
    { key: 'uocra', label: 'UOCRA CCT 76/75' },
    { key: 'gastronomia', label: 'Gastronomía FEHGRA CCT 389/04' },
    { key: 'farmacia', label: 'Farmacia Mendoza CCT 429/05' },
  ];
  years = [2025, 2026, 2027];

  constructor(private api: ApiService) {}

  ngOnInit() {}

  loadHistory() {
    if (!this.selectedConvention) return;
    this.loading = true;
    this.api.get<ScaleVersion[]>(`/admin/scale-versions/history/${this.selectedConvention}`).subscribe({
      next: (data) => {
        this.allVersions = data;
        this.applyYearFilter();
        this.loading = false;
      },
      error: () => { this.loading = false; },
    });
  }

  onYearFilter() { this.applyYearFilter(); }

  applyYearFilter() {
    this.filteredVersions = this.selectedYear
      ? this.allVersions.filter((v) => v.periodYear === Number(this.selectedYear))
      : this.allVersions;
  }

  openVersion(v: ScaleVersion) { this.openedVersion = v; }
  closeVersion() { this.openedVersion = null; }
  fmt(val: number | null | undefined): string {
    if (val == null) return '—';
    return '$ ' + val.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }

  periodLabel(month: number, year: number): string {
    const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    return `${months[month - 1] ?? 'Período'} ${year}`;
  }

  conventionLabel(key: string): string {
    return this.conventions.find((c) => c.key === key)?.label ?? key;
  }
}
