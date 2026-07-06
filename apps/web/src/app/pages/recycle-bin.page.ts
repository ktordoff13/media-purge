import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ApiService } from '../core/api.service';
import { RecycleBinEntry } from '../core/models';
import { BytesPipe } from '../core/pipes';

@Component({
  selector: 'app-recycle-bin-page',
  imports: [MatButtonModule, MatIconModule, MatTooltipModule, BytesPipe, DatePipe],
  template: `
    <div class="page">
      <h1 class="page-title">Recycle bin</h1>
      <p class="page-subtitle">
        Approved deletions wait here. Restore anything you regret — files move back to their
        original paths. After the retention window they are purged for good.
      </p>

      @if (!entries().length) {
        <div class="empty">
          <mat-icon>delete_outline</mat-icon>
          <p>The bin is empty.</p>
        </div>
      }

      <div class="bin-list">
        @for (entry of entries(); track entry.id) {
          <div class="bin-card" [class.resolved]="entry.status !== 'binned'">
            <div class="bin-body">
              <div class="bin-title">{{ entry.title }}</div>
              <div class="muted bin-meta">
                {{ entry.files.length }} file(s) · moved {{ entry.movedAt | date: 'medium' }}
                @if (entry.status === 'binned') {
                  · <b [class.urgent]="daysLeft(entry) <= 3">purges in {{ daysLeft(entry) }} day(s)</b>
                } @else {
                  · {{ entry.status }}
                }
              </div>
            </div>
            <div class="bin-size">{{ entry.sizeBytes | bytes }}</div>
            @if (entry.status === 'binned') {
              <div class="bin-actions">
                <button matButton (click)="restore(entry)">
                  <mat-icon>restore</mat-icon> Restore
                </button>
                <button matButton matTooltip="Skip retention and delete now" class="danger" (click)="purge(entry)">
                  <mat-icon>delete_forever</mat-icon> Purge now
                </button>
              </div>
            }
          </div>
        }
      </div>
    </div>
  `,
  styles: `
    .bin-list { display: flex; flex-direction: column; gap: 10px; }
    .bin-card { display: flex; align-items: center; gap: 16px; border-radius: 14px;
      background: var(--mat-sys-surface-container); padding: 14px 20px; }
    .bin-card.resolved { opacity: 0.55; }
    .bin-body { flex: 1; min-width: 0; }
    .bin-title { font: var(--mat-sys-title-medium); }
    .bin-meta { font: var(--mat-sys-body-small); margin-top: 2px; }
    .bin-size { font: var(--mat-sys-title-medium); font-variant-numeric: tabular-nums; }
    .bin-actions { display: flex; gap: 4px; }
    .danger { color: var(--mat-sys-error); }
    .urgent { color: var(--mat-sys-error); }
    .empty { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 64px 0;
      color: var(--mat-sys-on-surface-variant);
      mat-icon { font-size: 44px; width: 44px; height: 44px; } }
  `,
})
export class RecycleBinPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly snack = inject(MatSnackBar);

  readonly entries = signal<RecycleBinEntry[]>([]);

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.api.recycleBin().subscribe((entries) => this.entries.set(entries));
  }

  daysLeft(entry: RecycleBinEntry): number {
    return Math.max(0, Math.ceil((new Date(entry.purgeAfter).getTime() - Date.now()) / 86_400_000));
  }

  restore(entry: RecycleBinEntry): void {
    this.api.restore(entry.id).subscribe({
      next: () => {
        this.snack.open(`Restored "${entry.title}"`, 'OK', { duration: 4000 });
        this.load();
      },
      error: (err) => this.snack.open(err?.error?.message ?? 'Restore failed', 'OK', { duration: 8000 }),
    });
  }

  purge(entry: RecycleBinEntry): void {
    if (!confirm(`Permanently delete "${entry.title}" (${entry.files.length} files)? This cannot be undone.`)) {
      return;
    }
    this.api.purge(entry.id).subscribe({
      next: () => {
        this.snack.open(`Purged "${entry.title}"`, 'OK', { duration: 4000 });
        this.load();
      },
      error: (err) => this.snack.open(err?.error?.message ?? 'Purge failed', 'OK', { duration: 8000 }),
    });
  }
}
