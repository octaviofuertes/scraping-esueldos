import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../core/auth.service';

@Component({
  selector: 'app-shell',
  template: `
    <div class="shell">
      <header class="shell-header">
        <div class="shell-brand">
          <span class="shell-logo">◎</span>
          <div>
            <strong>Scraping eSueldos</strong>
            <small>Monitoreo de escalas salariales CCT</small>
          </div>
        </div>
        <div class="shell-user">
          <span>{{ (auth.user$ | async)?.email }}</span>
          <button class="btn-secondary btn-sm" (click)="logout()">Salir</button>
        </div>
      </header>

      <nav class="shell-nav">
        <a routerLink="/app/fuentes" routerLinkActive="active">Sitios monitoreados</a>
        <a routerLink="/app/detectadas" routerLinkActive="active">Escalas para revisar</a>
        <a routerLink="/app/aprobadas" routerLinkActive="active">Escalas aprobadas</a>
        <a routerLink="/app/normativa" routerLinkActive="active">Cambios de convenios</a>
      </nav>

      <main class="shell-main">
        <router-outlet></router-outlet>
      </main>
    </div>
  `,
})
export class ShellComponent {
  constructor(public auth: AuthService, private router: Router) {}

  logout() {
    this.auth.logout();
    this.router.navigate(['/login']);
  }
}
