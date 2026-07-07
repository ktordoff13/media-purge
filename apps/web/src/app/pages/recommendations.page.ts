import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ApiService } from '../core/api.service';
import { Recommendation, RecommendationStatus } from '../core/models';
import { BytesPipe, TimeAgoPipe } from '../core/pipes';

@Component({
  selector: 'app-recommendations-page',
  imports: [
    FormsModule,
    MatButtonModule,
    MatCheckboxModule,
    MatChipsModule,
    MatFormFieldModule,
    MatIconModule,
    MatProgressBarModule,
    MatSelectModule,
    MatTooltipModule,
    BytesPipe,
    TimeAgoPipe,
    DatePipe,
  ],
  template: `
    <div class="page">
      <h1 class="page-title">Recommendations</h1>
      <p class="page-subtitle">
        Every suggestion is explained by the rules that matched it. Approving moves files to the
        recycle bin — nothing is permanently deleted until the retention window lapses.
      </p>

      <div class="filter-row">
        <mat-form-field appearance="outline" class="dense">
          <mat-label>Status</mat-label>
          <mat-select [(ngModel)]="status" (selectionChange)="load()">
            <mat-option value="open">Open</mat-option>
            <mat-option value="approved">Approved</mat-option>
            <mat-option value="dismissed">Dismissed</mat-option>
            <mat-option value="restored">Restored</mat-option>
            <mat-option value="purged">Purged</mat-option>
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline" class="dense">
          <mat-label>Sort by</mat-label>
          <mat-select [(ngModel)]="sort" (selectionChange)="load()">
            <mat-option value="score">Strongest case</mat-option>
            <mat-option value="size">Biggest win</mat-option>
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline" class="dense">
          <mat-label>Library</mat-label>
          <mat-select [(ngModel)]="library" (selectionChange)="load()">
            <mat-option [value]="''">All</mat-option>
            @for (lib of libraries(); track lib) {
              <mat-option [value]="lib">{{ lib }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <div class="spacer"></div>
        <div class="total muted">
          {{ recs().length }} items · {{ totalBytes() | bytes }} total
        </div>
        @if (status === 'open') {
          <button matButton (click)="askAi()" matTooltip="Ask your local AI to flag items you might regret deleting — just for fun, never changes scores">
            <mat-icon>psychology</mat-icon> AI regret check
          </button>
        }
      </div>

      @if (selected().size && status === 'open') {
        <div class="bulk-bar">
          <span>{{ selected().size }} selected · {{ selectedBytes() | bytes }}</span>
          <span class="spacer"></span>
          <button matButton (click)="bulk('dismiss')"><mat-icon>close</mat-icon> Dismiss</button>
          <button matButton="filled" (click)="bulk('approve')">
            <mat-icon>delete_sweep</mat-icon> Approve deletion
          </button>
        </div>
      }

      @if (loading()) {
        <mat-progress-bar mode="indeterminate" />
      } @else if (!recs().length) {
        <div class="empty">
          <mat-icon>task_alt</mat-icon>
          <p>Nothing here. Run a scan from the dashboard, or relax your rules.</p>
        </div>
      }

      <div class="rec-list">
        @for (rec of recs(); track rec.id) {
          <div class="rec-card" [class.expanded]="expanded() === rec.id">
            <div class="rec-main">
              @if (status === 'open') {
                <mat-checkbox
                  [checked]="selected().has(rec.id)"
                  (change)="toggle(rec.id)"
                  class="rec-check"
                />
              }
              <img
                class="poster"
                [src]="api.posterUrl(rec.mediaItem.id)"
                loading="lazy"
                alt=""
                (error)="hidePoster($event)"
              />
              <div class="rec-body" (click)="expand(rec.id)">
                <div class="rec-title-row">
                  <span class="rec-title">{{ rec.mediaItem.title }}</span>
                  @if (rec.mediaItem.year) {
                    <span class="muted">({{ rec.mediaItem.year }})</span>
                  }
                  <span class="type-chip">{{ rec.mediaItem.type }}</span>
                  @if (rec.mediaItem.resolution) {
                    <span class="type-chip">{{ rec.mediaItem.resolution }}</span>
                  }
                </div>
                <div class="rec-meta muted">
                  {{ rec.mediaItem.libraryName }} ·
                  {{ rec.mediaItem.playCount }} plays ·
                  last played {{ rec.mediaItem.lastPlayedAt | timeAgo }} ·
                  added {{ rec.mediaItem.addedAt | timeAgo }}
                </div>
                @if (rec.aiNote) {
                  <div class="ai-note" matTooltip="A local AI's opinion — display only, never affects scoring">
                    <mat-icon inline>psychology</mat-icon> {{ rec.aiNote }}
                  </div>
                }
                <mat-chip-set class="reason-chips">
                  @for (reason of rec.reasons; track reason.ruleKey) {
                    <mat-chip [matTooltip]="reason.reason" disableRipple>
                      {{ reason.ruleName }} · {{ reason.points }}
                    </mat-chip>
                  }
                </mat-chip-set>
              </div>
              <div class="rec-side">
                <div class="rec-size">{{ rec.sizeBytes | bytes }}</div>
                <div class="rec-score muted" matTooltip="Aggregate rule score">score {{ rec.totalScore }}</div>
                @if (status === 'open') {
                  <div class="rec-actions">
                    <button matIconButton matTooltip="Protect — never suggest again" (click)="protect(rec)">
                      <mat-icon>shield</mat-icon>
                    </button>
                    <button matIconButton matTooltip="Dismiss" (click)="dismiss(rec)">
                      <mat-icon>close</mat-icon>
                    </button>
                    <button matIconButton matTooltip="Approve deletion" class="approve" (click)="approve(rec)">
                      <mat-icon>delete</mat-icon>
                    </button>
                  </div>
                }
              </div>
            </div>
            @if (expanded() === rec.id) {
              <div class="rec-detail">
                <div class="detail-grid">
                  <div>
                    <div class="detail-label">Why</div>
                    @for (reason of rec.reasons; track reason.ruleKey) {
                      <div class="detail-reason">• {{ reason.reason }} <span class="muted">(+{{ reason.points }})</span></div>
                    }
                  </div>
                  <div>
                    <div class="detail-label">Files ({{ rec.mediaItem.filePaths.length }})</div>
                    @for (path of rec.mediaItem.filePaths.slice(0, 8); track path) {
                      <div class="detail-path">{{ path }}</div>
                    }
                    @if (rec.mediaItem.filePaths.length > 8) {
                      <div class="muted">…and {{ rec.mediaItem.filePaths.length - 8 }} more</div>
                    }
                  </div>
                  <div>
                    <div class="detail-label">Details</div>
                    <div>Rating: {{ rec.mediaItem.ratingAudience ?? rec.mediaItem.ratingCritic ?? '—' }}</div>
                    @if (rec.mediaItem.type === 'show') {
                      <div>Episodes: {{ rec.mediaItem.watchedEpisodeCount }}/{{ rec.mediaItem.episodeCount }} watched</div>
                    }
                    <div>Versions: {{ rec.mediaItem.versionCount }}</div>
                    @if (rec.mediaItem.addedAt) {
                      <div>Added: {{ rec.mediaItem.addedAt | date: 'mediumDate' }}</div>
                    }
                  </div>
                </div>
              </div>
            }
          </div>
        }
      </div>
    </div>
  `,
  styles: `
    .filter-row { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
    .dense { width: 170px; }
    .total { font-variant-numeric: tabular-nums; }
    .bulk-bar { display: flex; align-items: center; gap: 12px; padding: 8px 16px; margin-bottom: 12px;
      border-radius: 12px; background: color-mix(in srgb, var(--mat-sys-primary) 15%, transparent); }
    .rec-list { display: flex; flex-direction: column; gap: 10px; }
    .rec-card { border-radius: 14px; background: var(--mat-sys-surface-container); overflow: hidden; }
    .rec-main { display: flex; align-items: center; gap: 14px; padding: 12px 16px; }
    .rec-check { flex: none; }
    .poster { width: 46px; height: 68px; object-fit: cover; border-radius: 8px; background: var(--mat-sys-surface-container-high); flex: none; }
    .rec-body { flex: 1; min-width: 0; cursor: pointer; }
    .rec-title-row { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
    .rec-title { font: var(--mat-sys-title-medium); }
    .type-chip { font: var(--mat-sys-label-small); border: 1px solid var(--mat-sys-outline-variant);
      padding: 1px 8px; border-radius: 999px; color: var(--mat-sys-on-surface-variant); text-transform: uppercase; }
    .rec-meta { font: var(--mat-sys-body-small); margin: 2px 0 6px; }
    .reason-chips { --mdc-chip-container-height: 24px; }
    .ai-note { display: flex; align-items: center; gap: 6px; font: var(--mat-sys-body-small);
      font-style: italic; color: var(--mat-sys-tertiary); margin: 2px 0 6px; }
    .rec-side { text-align: right; flex: none; }
    .rec-size { font: var(--mat-sys-title-medium); font-variant-numeric: tabular-nums; }
    .rec-score { font: var(--mat-sys-body-small); }
    .rec-actions { display: flex; gap: 0; margin-top: 4px; }
    .approve { color: var(--mat-sys-error); }
    .rec-detail { border-top: 1px solid var(--mat-sys-outline-variant); padding: 14px 20px; background: var(--mat-sys-surface-container-low); }
    .detail-grid { display: grid; grid-template-columns: 1fr 1.4fr 0.8fr; gap: 20px; font: var(--mat-sys-body-medium); }
    .detail-label { font: var(--mat-sys-label-medium); text-transform: uppercase; letter-spacing: 0.08em;
      color: var(--mat-sys-on-surface-variant); margin-bottom: 6px; }
    .detail-path { font-family: monospace; font-size: 12px; overflow-wrap: anywhere; color: var(--mat-sys-on-surface-variant); }
    .detail-reason { margin-bottom: 4px; }
    .empty { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 64px 0;
      color: var(--mat-sys-on-surface-variant);
      mat-icon { font-size: 44px; width: 44px; height: 44px; } }
    @media (max-width: 900px) { .detail-grid { grid-template-columns: 1fr; } }
  `,
})
export class RecommendationsPage implements OnInit {
  readonly api = inject(ApiService);
  private readonly snack = inject(MatSnackBar);

  status: RecommendationStatus = 'open';
  sort: 'score' | 'size' = 'score';
  library = '';

  readonly recs = signal<Recommendation[]>([]);
  readonly loading = signal(false);
  readonly selected = signal<Set<number>>(new Set());
  readonly expanded = signal<number | null>(null);
  readonly libraries = computed(() => [...new Set(this.recs().map((r) => r.mediaItem.libraryName))].sort());
  readonly totalBytes = computed(() => this.recs().reduce((sum, r) => sum + Number(r.sizeBytes), 0));
  readonly selectedBytes = computed(() =>
    this.recs()
      .filter((r) => this.selected().has(r.id))
      .reduce((sum, r) => sum + Number(r.sizeBytes), 0),
  );

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.selected.set(new Set());
    this.api
      .recommendations({ status: this.status, sort: this.sort, library: this.library || undefined })
      .subscribe({
        next: (recs) => {
          this.recs.set(recs);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }

  toggle(id: number): void {
    const next = new Set(this.selected());
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.selected.set(next);
  }

  expand(id: number): void {
    this.expanded.set(this.expanded() === id ? null : id);
  }

  approve(rec: Recommendation): void {
    this.api.approve(rec.id).subscribe({
      next: (res) => {
        this.snack.open(res.message, 'OK', { duration: 7000 });
        if (!res.dryRun) this.load();
      },
      error: (err) => this.snack.open(err?.error?.message ?? 'Approve failed', 'OK', { duration: 8000 }),
    });
  }

  dismiss(rec: Recommendation): void {
    this.api.dismiss(rec.id).subscribe(() => this.load());
  }

  protect(rec: Recommendation): void {
    this.api.protect(rec.id).subscribe(() => {
      this.snack.open(`"${rec.mediaItem.title}" is now protected`, 'OK', { duration: 4000 });
      this.load();
    });
  }

  bulk(action: 'approve' | 'dismiss'): void {
    const ids = [...this.selected()];
    this.api.bulk(ids, action).subscribe(({ results }) => {
      const failed = results.filter((r) => !r.ok);
      const note = failed.length ? ` (${failed.length} failed: ${failed[0].message})` : '';
      this.snack.open(`${results.length - failed.length} ${action}d${note}`, 'OK', { duration: 6000 });
      this.load();
    });
  }

  askAi(): void {
    this.api.aiAdvise().subscribe({
      next: (res) => {
        this.snack.open(res.message, 'OK', { duration: 6000 });
        if (res.started) this.pollForNotes();
      },
      error: (err) => this.snack.open(err?.error?.message ?? 'AI advisor unavailable', 'OK', { duration: 7000 }),
    });
  }

  /** Reload periodically while the background advisory pass fills in notes. */
  private pollForNotes(attempt = 0): void {
    if (attempt >= 20) return;
    setTimeout(() => {
      const before = this.recs().filter((r) => r.aiNote).length;
      this.api
        .recommendations({ status: this.status, sort: this.sort, library: this.library || undefined })
        .subscribe((recs) => {
          this.recs.set(recs);
          const after = recs.filter((r) => r.aiNote).length;
          if (after === before) this.pollForNotes(attempt + 1);
        });
    }, 6000);
  }

  hidePoster(event: Event): void {
    (event.target as HTMLImageElement).style.visibility = 'hidden';
  }
}
