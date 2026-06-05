import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-login',
  template: `
    <div class="login-wrap">
      <div class="login-card">
        <div class="login-brand">
          <span class="login-logo">◎</span>
          <h1>Scraping eSueldos</h1>
          <p>Monitoreo automático de escalas salariales</p>
        </div>
        <form (ngSubmit)="submit()" class="login-form">
          <label>Email
            <input type="email" [(ngModel)]="email" name="email" required autocomplete="username" />
          </label>
          <label>Contraseña
            <input type="password" [(ngModel)]="password" name="password" required autocomplete="current-password" />
          </label>
          <div class="login-error" *ngIf="error">{{ error }}</div>
          <button type="submit" class="btn-primary" [disabled]="loading">
            {{ loading ? 'Ingresando…' : 'Ingresar' }}
          </button>
        </form>
        <p class="login-hint">Demo: <b>admin&#64;demo.com</b> / <b>admin123</b></p>
      </div>
    </div>
  `,
})
export class LoginComponent {
  email = 'admin@demo.com';
  password = 'admin123';
  loading = false;
  error = '';

  constructor(private auth: AuthService, private router: Router) {}

  submit() {
    this.loading = true;
    this.error = '';
    this.auth.login(this.email, this.password).subscribe({
      next: (r) => {
        this.auth.setSession(r.token, r.user);
        this.loading = false;
        this.router.navigate(['/app/fuentes']);
      },
      error: (err) => {
        this.loading = false;
        this.error = err?.error?.message ?? 'No se pudo iniciar sesión';
      },
    });
  }
}
