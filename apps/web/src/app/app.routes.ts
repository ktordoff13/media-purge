import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
  {
    path: 'dashboard',
    title: 'Dashboard · Media Review',
    loadComponent: () => import('./pages/dashboard.page').then((m) => m.DashboardPage),
  },
  {
    path: 'recommendations',
    title: 'Recommendations · Media Review',
    loadComponent: () => import('./pages/recommendations.page').then((m) => m.RecommendationsPage),
  },
  {
    path: 'rules',
    title: 'Rules · Media Review',
    loadComponent: () => import('./pages/rules.page').then((m) => m.RulesPage),
  },
  {
    path: 'recycle-bin',
    title: 'Recycle Bin · Media Review',
    loadComponent: () => import('./pages/recycle-bin.page').then((m) => m.RecycleBinPage),
  },
  {
    path: 'activity',
    title: 'Activity · Media Review',
    loadComponent: () => import('./pages/activity.page').then((m) => m.ActivityPage),
  },
  {
    path: 'maintenance',
    title: 'Maintenance · Media Review',
    loadComponent: () => import('./pages/maintenance.page').then((m) => m.MaintenancePage),
  },
  {
    path: 'settings',
    title: 'Settings · Media Review',
    loadComponent: () => import('./pages/settings.page').then((m) => m.SettingsPage),
  },
  { path: '**', redirectTo: 'dashboard' },
];
