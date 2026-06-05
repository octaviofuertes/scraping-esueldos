import { Component, EventEmitter, Output } from '@angular/core';
import { ApiService } from '../../core/api.service';

@Component({
  selector: 'app-manual-upload',
  template: `
    <div class="manual-upload-card">
      <div class="mu-header">
        <span class="mu-icon">⬆</span>
        <div>
          <h4>Cargar escala manualmente</h4>
          <p>Subí un PDF de escala salarial. pIA lo lee, detecta los meses y deja todo en "Escalas para revisar" para tu aprobación. Mismo flujo que el monitoreo automático.</p>
        </div>
      </div>

      <form class="mu-form" (ngSubmit)="upload()">
        <label>Convenio
          <select [(ngModel)]="calculatorKey" name="calculatorKey" required>
            <option value="">Seleccioná un convenio</option>
            <option *ngFor="let c of conventions" [value]="c.key">{{ c.label }}</option>
          </select>
        </label>

        <label>Archivo PDF de la escala
          <div class="mu-file" [class.has-file]="selectedFile">
            <input #fileInput type="file" accept="application/pdf,.pdf" (change)="onFile($event)" hidden />
            <button type="button" class="btn-secondary" (click)="fileInput.click()">Seleccionar PDF</button>
            <span class="mu-file-name" *ngIf="selectedFile">{{ selectedFile.name }}</span>
            <span class="mu-file-name muted" *ngIf="!selectedFile">Ningún archivo seleccionado</span>
          </div>
        </label>

        <div class="mu-result" *ngIf="resultMsg" [class.mu-error]="isError">{{ resultMsg }}</div>

        <div class="mu-actions">
          <button type="submit" class="btn-primary" [disabled]="!canSubmit || uploading">
            {{ uploading ? 'Procesando con pIA…' : 'Subir y analizar' }}
          </button>
        </div>
      </form>
    </div>
  `,
})
export class ManualUploadComponent {
  @Output() uploaded = new EventEmitter<void>();

  calculatorKey = '';
  selectedFile: File | null = null;
  uploading = false;
  resultMsg = '';
  isError = false;

  conventions = [
    { key: 'camioneros', label: 'Camioneros CCT 40/89' },
    { key: 'metalurgicos', label: 'Metalúrgicos CCT 260/75' },
    { key: 'comercio', label: 'Comercio CCT 130/75' },
    { key: 'uocra', label: 'UOCRA CCT 76/75' },
    { key: 'gastronomia', label: 'Gastronomía FEHGRA CCT 389/04' },
    { key: 'farmacia', label: 'Farmacia Mendoza CCT 429/05' },
  ];

  get canSubmit(): boolean {
    return !!this.calculatorKey && !!this.selectedFile;
  }

  constructor(private api: ApiService) {}

  onFile(event: Event) {
    const input = event.target as HTMLInputElement;
    this.selectedFile = input.files && input.files.length ? input.files[0] : null;
    this.resultMsg = '';
  }

  upload() {
    if (!this.canSubmit || !this.selectedFile) return;
    this.uploading = true;
    this.resultMsg = '';
    this.isError = false;

    const form = new FormData();
    form.append('file', this.selectedFile);
    form.append('calculatorKey', this.calculatorKey);

    this.api.postForm<{ candidateId: string; createdCount: number }>('/admin/scale-candidates/upload', form).subscribe({
      next: (r) => {
        this.uploading = false;
        this.isError = false;
        this.resultMsg = `Listo. Se procesó el PDF y se cargaron ${r.createdCount} escala(s) en "Escalas para revisar".`;
        this.selectedFile = null;
        this.uploaded.emit();
      },
      error: (err) => {
        this.uploading = false;
        this.isError = true;
        this.resultMsg = err?.error?.message ?? 'Error al procesar el archivo. Revisá que sea un PDF con texto.';
      },
    });
  }
}
