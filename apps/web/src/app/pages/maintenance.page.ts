import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ApiService } from '../core/api.service';
import { MaintenanceOperation, MediaSource } from '../core/models';

@Component({
  selector: 'app-maintenance-page',
  imports: [FormsModule, MatButtonModule, MatFormFieldModule, MatIconModule, MatProgressBarModule, MatSelectModule, MatTooltipModule],
  template: `
    <div class="page">
      <h1 class="page-title">Server maintenance</h1>
      <p class="page-subtitle">
        Shrink your media server's appdata: purge regenerable image caches (often 50–100+ GB on
        long-lived Plex servers) and trigger the server's own housekeeping tasks. Cache purges
        honor dry-run mode.
      </p>

      @if (!sources().length) {
        <div class="empty">
          <mat-icon>dns</mat-icon>
          <p>No media sources configured yet — add one in Settings.</p>
        </div>
      } @else {
        <mat-form-field appearance="outline" class="source-select">
          <mat-label>Media source</mat-label>
          <mat-select [(ngModel)]="sourceId" (selectionChange)="loadOps()">
            @for (source of sources(); track source.id) {
              <mat-option [value]="source.id">{{ source.name }} ({{ source.type }})</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <div class="ops-grid">
          @for (op of ops(); track op.key) {
            <div class="op-card" [class.unavailable]="!op.available">
              <div class="op-head">
                <div class="op-name">
                  {{ op.name }}
                  @if (op.filesystem) {
                    <mat-icon
                      inline
                      class="fs-icon"
                      matTooltip="Deletes files from the mounted appdata dir — honors dry-run"
                    >folder</mat-icon>
                  }
                </div>
                <button
                  matButton="filled"
                  [disabled]="!op.available || running() === op.key"
                  (click)="run(op)"
                >
                  {{ running() === op.key ? 'Running…' : 'Run' }}
                </button>
              </div>
              <p class="muted op-desc">{{ op.description }}</p>
              @if (!op.available && op.unavailableReason) {
                <p class="op-warn">{{ op.unavailableReason }}</p>
              }
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: `
    .source-select { width: 320px; }
    .ops-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 16px; }
    .op-card { border-radius: 14px; background: var(--mat-sys-surface-container); padding: 18px 20px; }
    .op-card.unavailable { opacity: 0.65; }
    .op-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    .op-name { font: var(--mat-sys-title-medium); display: flex; align-items: center; gap: 6px; }
    .fs-icon { color: var(--mat-sys-tertiary); }
    .op-desc { font: var(--mat-sys-body-medium); margin: 8px 0 0; }
    .op-warn { font: var(--mat-sys-body-small); color: var(--mat-sys-error); margin: 8px 0 0; }
    .empty { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 64px 0;
      color: var(--mat-sys-on-surface-variant);
      mat-icon { font-size: 44px; width: 44px; height: 44px; } }
  `,
})
export class MaintenancePage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly snack = inject(MatSnackBar);

  sourceId: number | null = null;
  readonly sources = signal<MediaSource[]>([]);
  readonly ops = signal<MaintenanceOperation[]>([]);
  readonly running = signal<string | null>(null);

  ngOnInit(): void {
    this.api.sources().subscribe((sources) => {
      this.sources.set(sources);
      if (sources.length) {
        this.sourceId = sources[0].id;
        this.loadOps();
      }
    });
  }

  loadOps(): void {
    if (this.sourceId == null) return;
    this.api.maintenanceOps(this.sourceId).subscribe((ops) => this.ops.set(ops));
  }

  run(op: MaintenanceOperation): void {
    if (this.sourceId == null) return;
    this.running.set(op.key);
    this.api.runMaintenance(this.sourceId, op.key).subscribe({
      next: (res) => {
        this.running.set(null);
        this.snack.open(res.message, 'OK', { duration: 8000 });
      },
      error: (err) => {
        this.running.set(null);
        this.snack.open(err?.error?.message ?? 'Operation failed', 'OK', { duration: 8000 });
      },
    });
  }
}
