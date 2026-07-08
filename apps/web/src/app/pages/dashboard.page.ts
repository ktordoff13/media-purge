import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { DatePipe } from '@angular/common';
import { ApiService } from '../core/api.service';
import { Dashboard, SetupStatus } from '../core/models';
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

      @if (showSetup() && setup(); as s) {
        <div class="setup-card">
          <div class="setup-head">
            <div>
              <div class="setup-title"><mat-icon>rocket_launch</mat-icon> Get set up</div>
              <div class="muted">A few connections make cleanup safe and useful. Here's what matters and why.</div>
            </div>
            @if (coreDone(s)) {
              <button matButton (click)="dismissSetup()">Dismiss</button>
            }
          </div>

          <div class="setup-step" [class.done]="s.sources > 0">
            <mat-icon>{{ s.sources > 0 ? 'check_circle' : 'radio_button_unchecked' }}</mat-icon>
            <div class="step-body">
              <div class="step-title">Connect your media server</div>
              <div class="step-why muted">
                Plex or Jellyfin — this is what gets scanned. Plex needs an X-Plex-Token; Jellyfin
                needs an <b>admin</b> API key so watch history covers every user in the house.
              </div>
            </div>
            <a matButton routerLink="/settings">Settings</a>
          </div>

          <div class="setup-step" [class.done]="s.pathMappings > 0">
            <mat-icon>{{ s.pathMappings > 0 ? 'check_circle' : 'radio_button_unchecked' }}</mat-icon>
            <div class="step-body">
              <div class="step-title">Map file paths</div>
              <div class="step-why muted">
                Your media server and this container usually mount the same share at different
                paths. Cleanup refuses to touch files it can't find — mappings translate the
                server's paths into this container's. Skip only if both containers mount media
                identically.
              </div>
            </div>
            <a matButton routerLink="/settings">Settings</a>
          </div>

          <div class="setup-step" [class.done]="arrConnected(s)">
            <mat-icon>{{ arrConnected(s) ? 'check_circle' : 'radio_button_unchecked' }}</mat-icon>
            <div class="step-body">
              <div class="step-title">Connect Sonarr / Radarr <span class="optional-tag">if you run them</span></div>
              <div class="step-why muted">
                Important: if the *arrs monitor your library, they'll quietly <b>re-download
                everything you delete</b>. When connected, Media Purge unmonitors items on
                approval so deleted stays deleted. Skip entirely if you don't use them.
              </div>
              @if (arrConnected(s) && !s.radarrEnabled && !s.sonarrEnabled) {
                <div class="step-caution">
                  <mat-icon>warning_amber</mat-icon> Connected, but "Unmonitor on approve" is
                  switched off — deleted items can still be re-downloaded.
                </div>
              }
            </div>
            <a matButton routerLink="/settings">Settings</a>
          </div>

          <div class="setup-step" [class.done]="s.completedScans > 0">
            <mat-icon>{{ s.completedScans > 0 ? 'check_circle' : 'radio_button_unchecked' }}</mat-icon>
            <div class="step-body">
              <div class="step-title">Run your first scan</div>
              <div class="step-why muted">
                Read-only against your server. It snapshots your libraries and produces
                recommendations, each explained by the rules that matched it.
              </div>
            </div>
            <button matButton (click)="scan()" [disabled]="scanning() || s.sources === 0">Scan now</button>
          </div>

          <div class="setup-step" [class.done]="!s.dryRun">
            <mat-icon>{{ !s.dryRun ? 'check_circle' : 'radio_button_unchecked' }}</mat-icon>
            <div class="step-body">
              <div class="step-title">Review in dry-run, then go live</div>
              <div class="step-why muted">
                Dry-run is ON by default: approvals only log what <i>would</i> happen. Approve a
                few items, confirm the file paths in the Activity log look right, then disable
                dry-run. Even live, deletions sit in the recycle bin for the retention window.
              </div>
            </div>
            <a matButton routerLink="/settings">Settings</a>
          </div>

          <div class="setup-extras muted">
            Also worth a look: a scan <a routerLink="/settings">schedule</a> (cron), appdata
            <a routerLink="/maintenance">maintenance</a> to shrink server caches, and the optional
            local <a routerLink="/settings">AI regret check</a>.
          </div>
        </div>
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
    .header-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
    .setup-card { border-radius: 16px; background: var(--mat-sys-surface-container); padding: 20px 24px;
      margin-bottom: 24px; border: 1px solid var(--mat-sys-outline-variant); }
    .setup-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 8px; }
    .setup-title { display: flex; align-items: center; gap: 8px; font: var(--mat-sys-title-medium);
      color: var(--mat-sys-primary); }
    .setup-step { display: flex; gap: 14px; align-items: flex-start; padding: 10px 0;
      border-top: 1px solid var(--mat-sys-outline-variant); }
    .setup-step mat-icon { margin-top: 2px; color: var(--mat-sys-on-surface-variant); flex: none; }
    .setup-step.done mat-icon { color: var(--mat-sys-tertiary); }
    .setup-step.done .step-title { text-decoration: line-through; opacity: 0.7; }
    .step-body { flex: 1; }
    .step-title { font: var(--mat-sys-title-small); }
    .step-why { font: var(--mat-sys-body-small); margin-top: 2px; max-width: 640px; line-height: 1.45; }
    .step-caution { display: flex; align-items: center; gap: 6px; font: var(--mat-sys-body-small);
      color: var(--mat-sys-error); margin-top: 4px;
      mat-icon { font-size: 16px; width: 16px; height: 16px; margin: 0; color: inherit; } }
    .optional-tag { font: var(--mat-sys-label-small); border: 1px solid var(--mat-sys-outline-variant);
      border-radius: 999px; padding: 1px 8px; margin-left: 6px; color: var(--mat-sys-on-surface-variant);
      text-decoration: none; display: inline-block; }
    .setup-extras { font: var(--mat-sys-body-small); padding-top: 10px;
      border-top: 1px solid var(--mat-sys-outline-variant); }
    .scan-bar { margin-bottom: 16px; border-radius: 4px; }
    .stat-value-small { font: var(--mat-sys-title-large); margin-top: 10px; }
    .section-title { font: var(--mat-sys-title-medium); margin: 32px 0 12px; }
    .lib-bars { display: flex; flex-direction: column; gap: 10px; }
    .lib-row { display: grid; grid-template-columns: 180px 1fr 90px; align-items: center; gap: 12px; }
    @media (max-width: 899px) {
      .lib-row { grid-template-columns: 1fr 90px; }
      .lib-name { grid-column: 1 / -1; margin-bottom: -6px; }
    }
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
  readonly setup = signal<SetupStatus | null>(null);
  readonly setupDismissed = signal(localStorage.getItem('mp.setupDismissed') === '1');
  readonly scanning = signal(false);
  readonly maxLibBytes = signal(1);
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  ngOnInit(): void {
    this.refresh();
  }

  ngOnDestroy(): void {
    this.stopPolling();
  }

  showSetup(): boolean {
    const s = this.setup();
    if (!s || this.setupDismissed()) return false;
    return true;
  }

  coreDone(s: SetupStatus): boolean {
    return s.sources > 0 && s.completedScans > 0;
  }

  arrConnected(s: SetupStatus): boolean {
    return s.radarrConfigured || s.sonarrConfigured || s.radarrEnabled || s.sonarrEnabled;
  }

  dismissSetup(): void {
    localStorage.setItem('mp.setupDismissed', '1');
    this.setupDismissed.set(true);
  }

  refresh(): void {
    this.api.setupStatus().subscribe((s) => this.setup.set(s));
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
