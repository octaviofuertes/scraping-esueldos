import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AuthGuard } from './core/auth.guard';
import { LoginComponent } from './features/auth/login.component';
import { ShellComponent } from './features/shell.component';
import { ScaleSourcesComponent } from './features/admin/scale-sources.component';
import { ScaleCandidatesComponent } from './features/admin/scale-candidates.component';
import { ScaleHistoryComponent } from './features/admin/scale-history.component';
import { CctChangesComponent } from './features/admin/cct-changes.component';

const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'login' },
  { path: 'login', component: LoginComponent },
  {
    path: 'app',
    component: ShellComponent,
    canActivate: [AuthGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'fuentes' },
      { path: 'fuentes', component: ScaleSourcesComponent },
      { path: 'detectadas', component: ScaleCandidatesComponent },
      { path: 'aprobadas', component: ScaleHistoryComponent },
      { path: 'normativa', component: CctChangesComponent },
    ],
  },
  { path: '**', redirectTo: 'login' },
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule],
})
export class AppRoutingModule {}
