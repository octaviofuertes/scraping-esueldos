import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { ApiService } from './api.service';

const TOKEN_KEY = 'scraping-esueldos-token';

export interface AuthUser {
  id: string;
  name?: string;
  email: string;
  role: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  user$ = new BehaviorSubject<AuthUser | null>(null);

  constructor(private api: ApiService) {
    const raw = localStorage.getItem('scraping-esueldos-user');
    if (raw) {
      try { this.user$.next(JSON.parse(raw)); } catch { /* ignore */ }
    }
  }

  get token(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  }

  get isLoggedIn(): boolean {
    return !!this.token;
  }

  login(email: string, password: string) {
    return this.api.post<{ token: string; user: AuthUser }>('/auth/login', { email, password });
  }

  setSession(token: string, user: AuthUser) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem('scraping-esueldos-user', JSON.stringify(user));
    this.user$.next(user);
  }

  logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem('scraping-esueldos-user');
    this.user$.next(null);
  }
}
