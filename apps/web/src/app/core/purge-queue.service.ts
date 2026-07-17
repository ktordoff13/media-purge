import { Injectable, inject, signal } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ApiService } from './api.service';
import { PurgeQueueState } from './models';

/**
 * Client mirror of the server-side approval queue. Approvals are enqueued on
 * the API (they keep running if this tab closes); this service polls the
 * queue while it is active and exposes progress as signals for the sidenav.
 */
@Injectable({ providedIn: 'root' })
export class PurgeQueueService {
  private readonly api = inject(ApiService);
  private readonly snack = inject(MatSnackBar);

  readonly active = signal(false);
  readonly total = signal(0);
  readonly done = signal(0);
  readonly failed = signal(0);
  readonly current = signal<{ recommendationId: number; title: string } | null>(null);
  /** Rec ids queued or in flight — pages disable those rows' actions. */
  readonly pending = signal<ReadonlySet<number>>(new Set());
  /** Bumped whenever the server finishes an item so list pages reload. */
  readonly completions = signal(0);

  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastState: PurgeQueueState | null = null;
  private lastErrorShown: string | null = null;

  constructor() {
    // Pick up a purge already running from another tab or a previous session.
    this.refresh();
  }

  enqueue(ids: number[]): void {
    if (!ids.length) return;
    this.api.purgeEnqueue(ids).subscribe({
      next: (s) => this.apply(s),
      error: (err) =>
        this.snack.open(
          (err as { error?: { message?: string } })?.error?.message ?? 'Failed to queue approvals',
          'OK',
          { duration: 8000 },
        ),
    });
  }

  /** Drop the queued remainder; the item currently moving finishes. */
  cancel(): void {
    this.api.purgeCancel().subscribe({
      next: (s) => {
        this.apply(s);
        if (s.active) {
          this.snack.open(
            `Canceled remaining approvals — finishing "${s.current?.title ?? 'current item'}"`,
            'OK',
            { duration: 6000 },
          );
        }
      },
      error: (err) =>
        this.snack.open(
          (err as { error?: { message?: string } })?.error?.message ?? 'Failed to cancel the queue',
          'OK',
          { duration: 8000 },
        ),
    });
  }

  private refresh(): void {
    this.api.purgeQueue().subscribe({
      next: (s) => this.apply(s),
      // Keep polling through transient errors while a purge is running.
      error: () => {
        if (this.active()) this.scheduleNext();
      },
    });
  }

  private apply(s: PurgeQueueState): void {
    const prev = this.lastState;
    this.lastState = s;

    if (prev && s.done !== prev.done) this.completions.update((n) => n + 1);
    if (s.lastError && s.lastError !== this.lastErrorShown) {
      this.lastErrorShown = s.lastError;
      this.snack.open(s.lastError, 'OK', { duration: 8000 });
    }
    if (prev?.active && !s.active) {
      this.snack.open(this.summary(s), 'OK', { duration: 7000 });
    }

    this.active.set(s.active);
    this.total.set(s.total);
    this.done.set(s.done);
    this.failed.set(s.failed);
    this.current.set(s.current);
    this.pending.set(new Set(s.pendingIds));

    if (s.active) this.scheduleNext();
  }

  private scheduleNext(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.refresh(), 1500);
  }

  private summary(s: PurgeQueueState): string {
    const moved = s.done - s.failed;
    let msg = s.dryRun
      ? `Dry run: would move ${s.dryRun} item(s) to the recycle bin`
      : `Moved ${moved} item(s) to the recycle bin`;
    if (s.failed) msg += ` — ${s.failed} failed`;
    return msg;
  }
}
