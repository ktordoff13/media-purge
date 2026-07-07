import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { DatePipe } from '@angular/common';
import { ApiService } from '../core/api.service';
import { Dashboard } from '../core/models';
import { BytesPipe, TimeAgoPipe } from '../core/pipes';

@Component({
  selector: 'app-dashboard-page',
  imports: [MatButtonModule, MatIconModule, MatProgressBarModule, MatTooltipModule, RouterLink, BytesPipe, TimeAgoPipe, DatePipe],
  template: `
    <div class="page">
      <div class="header-row">
        <div>
          <h1 class="page-title">Dashboard</h1>
          <p class="page-subtitle">What your libraries hold and what you could get back.</p>
        </div>
        <button matButton="filled" (click)="scan()" [disabled]="scanning()">
          <mat-icon>{{ scanning() ? 'hourglass_top' : 'radar' }}</mat-icon>
          {{ scanning() ? 'Scanning…' : 'Scan now' }}
        </button>
      </div>

      @if (scanning()) {
        <mat-progress-bar mode="indeterminate" class="scan-bar" />
      }

      @if (data(); as d) {
        <div class="stat-grid">
          <div class="stat-tile accent">
            <div class="stat-label">Reclaimable now</div>
            <div class="stat-value">{{ d.reclaimableBytes | bytes }}</div>
            <div class="stat-hint">
              <a routerLink="/recommendations">{{ d.openRecommendations }} open recommendations</a>
            </div>
          </div>
          <div class="stat-tile good">
            <div class="stat-label">Space saved so far</div>
            <div class="stat-value">{{ d.spaceSavedBytes | bytes }}</div>
            <div class="stat-hint">purged via Media Purge</div>
          </div>
          <div class="stat-tile">
            <div class="stat-label">Library size</div>
            <div class="stat-value">{{ d.lastScan?.totalSizeBytes ?? 0 | bytes }}</div>
            <div class="stat-hint">{{ d.lastScan?.itemCount ?? 0 }} movies & shows</div>
          </div>
          <div class="stat-tile">
            <div class="stat-label">Last scan</div>
            <div class="stat-value stat-value-small">
              @if (d.lastScan) {
                {{ d.lastScan.startedAt | timeAgo }}
              } @else {
                never
              }
            </div>
            <div class="stat-hint">
              @if (d.lastScan) {
                {{ d.lastScan.status }} · {{ d.lastScan.startedAt | date: 'medium' }}
              } @else {
                configure a source in Settings, then scan
              }
            </div>
          </div>
        </div>

        @if (d.libraries.length) {
          <h2 class="section-title">Storage by library</h2>
          <div class="lib-bars">
            @for (lib of d.libraries; track lib.libraryName) {
              <div class="lib-row">
                <div class="lib-name">{{ lib.libraryName }}</div>
                <div class="lib-bar-track">
                  <div
                    class="lib-bar"
                    [style.width.%]="(lib.sizeBytes / maxLibBytes()) * 100"
                    [matTooltip]="lib.itemCount + ' items'"
                  ></div>
                </div>
                <div class="lib-size">{{ lib.sizeBytes | bytes }}</div>
              </div>
            }
          </div>
        } @else if (!d.lastScan) {
          <div class="empty">
            <mat-icon>satellite_alt</mat-icon>
            <p>No scans yet. Add your Plex or Jellyfin server under <a routerLink="/settings">Settings</a>, then hit <b>Scan now</b>.</p>
          </div>
        }
      }
    </div>
  `,
  styles: `
    .header-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
    .scan-bar { margin-bottom: 16px; border-radius: 4px; }
    .stat-value-small { font: var(--mat-sys-title-large); margin-top: 10px; }
    .section-title { font: var(--mat-sys-title-medium); margin: 32px 0 12px; }
    .lib-bars { display: flex; flex-direction: column; gap: 10px; }
    .lib-row { display: grid; grid-template-columns: 180px 1fr 90px; align-items: center; gap: 12px; }
    .lib-name { font: var(--mat-sys-body-medium); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .lib-bar-track { background: var(--mat-sys-surface-container); border-radius: 6px; height: 22px; overflow: hidden; }
    .lib-bar { background: linear-gradient(90deg, var(--mat-sys-primary), var(--mat-sys-tertiary)); height: 100%; border-radius: 6px; min-width: 3px; }
    .lib-size { text-align: right; font-variant-numeric: tabular-nums; color: var(--mat-sys-on-surface-variant); }
    .empty { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 64px 0; color: var(--mat-sys-on-surface-variant); text-align: center;
      mat-icon { font-size: 44px; width: 44px; height: 44px; } }
    a { color: var(--mat-sys-primary); }
  `,
})
export class DashboardPage implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  private readonly snack = inject(MatSnackBar);

  readonly data = signal<Dashboard | null>(null);
  readonly scanning = signal(false);
  readonly maxLibBytes = signal(1);
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  ngOnInit(): void {
    this.refresh();
  }

  ngOnDestroy(): void {
    this.stopPolling();
  }

  refresh(): void {
    this.api.dashboard().subscribe((d) => {
      this.data.set(d);
      this.maxLibBytes.set(Math.max(1, ...d.libraries.map((l) => l.sizeBytes)));
      if (d.lastScan?.status === 'running') this.startPolling();
    });
  }

  scan(): void {
    this.scanning.set(true);
    this.api.startScan().subscribe({
      next: () => this.startPolling(),
      error: (err) => {
        this.scanning.set(false);
        this.snack.open(err?.error?.message ?? 'Could not start scan', 'OK', { duration: 6000 });
      },
    });
  }

  private startPolling(): void {
    this.scanning.set(true);
    this.stopPolling();
    this.pollTimer = setInterval(() => {
      this.api.latestScan().subscribe(({ running }) => {
        if (!running) {
          this.stopPolling();
          this.scanning.set(false);
          this.refresh();
          this.snack.open('Scan finished', 'OK', { duration: 4000 });
        }
      });
    }, 2500);
  }

  private stopPolling(): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = null;
  }
}
