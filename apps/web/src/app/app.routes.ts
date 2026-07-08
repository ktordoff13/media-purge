import { CanDeactivateFn, Routes } from '@angular/router';

const confirmUnsavedChanges: CanDeactivateFn<{ hasUnsavedChanges(): boolean }> = (component) =>
  !component.hasUnsavedChanges() ||
  confirm('You have unsaved changes that will be lost. Leave without saving?');

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
  {
    path: 'dashboard',
    title: 'Dashboard · Media Purge',
    loadComponent: () => import('./pages/dashboard.page').then((m) => m.DashboardPage),
  },
  {
    path: 'recommendations',
    title: 'Recommendations · Media Purge',
    loadComponent: () => import('./pages/recommendations.page').then((m) => m.RecommendationsPage),
  },
  {
    path: 'rules',
    title: 'Rules · Media Purge',
    loadComponent: () => import('./pages/rules.page').then((m) => m.RulesPage),
  },
  {
    path: 'recycle-bin',
    title: 'Recycle Bin · Media Purge',
    loadComponent: () => import('./pages/recycle-bin.page').then((m) => m.RecycleBinPage),
  },
  {
    path: 'activity',
    title: 'Activity · Media Purge',
    loadComponent: () => import('./pages/activity.page').then((m) => m.ActivityPage),
  },
  {
    path: 'maintenance',
    title: 'Maintenance · Media Purge',
    loadComponent: () => import('./pages/maintenance.page').then((m) => m.MaintenancePage),
  },
  {
    path: 'settings',
    title: 'Settings · Media Purge',
    loadComponent: () => import('./pages/settings.page').then((m) => m.SettingsPage),
    canDeactivate: [confirmUnsavedChanges],
  },
  { path: '**', redirectTo: 'dashboard' },
];
