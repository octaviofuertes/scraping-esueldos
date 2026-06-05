import { HttpClientModule, HTTP_INTERCEPTORS } from '@angular/common/http';
import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BrowserModule } from '@angular/platform-browser';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { ShellComponent } from './features/shell.component';
import { LoginComponent } from './features/auth/login.component';
import { ScaleSourcesComponent } from './features/admin/scale-sources.component';
import { ScaleCandidatesComponent } from './features/admin/scale-candidates.component';
import { ScaleHistoryComponent } from './features/admin/scale-history.component';
import { CctChangesComponent } from './features/admin/cct-changes.component';
import { ManualUploadComponent } from './features/admin/manual-upload.component';
import { AuthInterceptor } from './core/auth.interceptor';

@NgModule({
  declarations: [
    AppComponent,
    ShellComponent,
    LoginComponent,
    ScaleSourcesComponent,
    ScaleCandidatesComponent,
    ScaleHistoryComponent,
    CctChangesComponent,
    ManualUploadComponent,
  ],
  imports: [BrowserModule, AppRoutingModule, HttpClientModule, FormsModule],
  providers: [{ provide: HTTP_INTERCEPTORS, useClass: AuthInterceptor, multi: true }],
  bootstrap: [AppComponent],
})
export class AppModule {}
