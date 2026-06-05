import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly baseUrl = this.resolveBaseUrl();

  constructor(private http: HttpClient) {}

  private resolveBaseUrl(): string {
    const hostname = window.location.hostname;
    if (hostname && hostname !== 'localhost' && hostname !== '127.0.0.1') {
      return `${window.location.protocol}//${hostname}:4100/api`;
    }
    return 'http://localhost:4100/api';
  }

  get<T>(path: string, query: Record<string, string | number | boolean | undefined | null> = {}): Observable<T> {
    let params = new HttpParams();
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') params = params.set(key, String(value));
    });
    return this.http.get<T>(`${this.baseUrl}${path}`, { params });
  }

  post<T>(path: string, body: unknown): Observable<T> {
    return this.http.post<T>(`${this.baseUrl}${path}`, body);
  }

  postForm<T>(path: string, form: FormData): Observable<T> {
    return this.http.post<T>(`${this.baseUrl}${path}`, form);
  }

  patch<T>(path: string, body: unknown): Observable<T> {
    return this.http.patch<T>(`${this.baseUrl}${path}`, body);
  }

  delete<T>(path: string): Observable<T> {
    return this.http.delete<T>(`${this.baseUrl}${path}`);
  }

  deleteWithQuery<T>(path: string, query: Record<string, string | number> = {}): Observable<T> {
    let params = new HttpParams();
    Object.entries(query).forEach(([key, value]) => { params = params.set(key, String(value)); });
    return this.http.delete<T>(`${this.baseUrl}${path}`, { params });
  }
}
