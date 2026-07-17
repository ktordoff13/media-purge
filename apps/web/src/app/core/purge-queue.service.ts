import { Injectable, inject, signal } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { ApiService } from './api.service';

export interface PurgeTask {
  id: number;
  title: string;
}

/**
 * Sequential queue for recommendation approvals. Items are approved one
 * request at a time (file moves can take minutes across filesystems), and
 * progress is exposed as signals so the sidenav can show it app-wide.
 */
@Injectable({ providedIn: 'root' })
export class PurgeQueueService {
  private readonly api = inject(ApiService);
  private readonly snack = inject(MatSnackBar);

  readonly active = signal(false);
  readonly total = signal(0);
  readonly done = signal(0);
  readonly failed = signal(0);
  readonly current = signal<PurgeTask | null>(null);
  /** Rec ids queued or in flight — pages disable those rows' actions. */
  readonly pending = signal<ReadonlySet<number>>(new Set());
  /** Bumped after every finished item so list pages know to reload. */
  readonly completions = signal(0);

  private queue: PurgeTask[] = [];
  private dryRunCount = 0;

  enqueue(tasks: PurgeTask[]): void {
    const fresh = tasks.filter((t) => !this.pending().has(t.id));
    if (!fresh.length) return;
    const next = new Set(this.pending());
    for (const t of fresh) next.add(t.id);
    this.pending.set(next);
    this.queue.push(...fresh);

    if (this.active()) {
      this.total.update((n) => n + fresh.length);
      return;
    }
    this.total.set(fresh.length);
    this.done.set(0);
    this.failed.set(0);
    this.dryRunCount = 0;
    this.active.set(true);
    void this.drain();
  }

  private async drain(): Promise<void> {
    for (let task = this.queue.shift(); task; task = this.queue.shift()) {
      this.current.set(task);
      try {
        const res = await firstValueFrom(this.api.approve(task.id));
        if (res.dryRun) this.dryRunCount++;
      } catch (err) {
        this.failed.update((n) => n + 1);
        const message =
          (err as { error?: { message?: string } })?.error?.message ?? 'Approve failed';
        this.snack.open(`"${task.title}": ${message}`, 'OK', { duration: 8000 });
      } finally {
        const next = new Set(this.pending());
        next.delete(task.id);
        this.pending.set(next);
        this.done.update((n) => n + 1);
        this.completions.update((n) => n + 1);
      }
    }
    this.current.set(null);
    this.active.set(false);
    this.snack.open(this.summary(), 'OK', { duration: 7000 });
  }

  private summary(): string {
    const failed = this.failed();
    const moved = this.done() - failed;
    let msg = this.dryRunCount
      ? `Dry run: would move ${this.dryRunCount} item(s) to the recycle bin`
      : `Moved ${moved} item(s) to the recycle bin`;
    if (failed) msg += ` — ${failed} failed`;
    return msg;
  }
}
