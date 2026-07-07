import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from './api.service';

/**
 * App-wide dry-run indicator state. The shell shows a persistent LIVE banner
 * on every page while dry-run is off, so real deletions are never a surprise.
 */
@Injectable({ providedIn: 'root' })
export class DryRunStateService {
  private readonly api = inject(ApiService);

  /** null until first load; true = dry-run (safe), false = live deletions. */
  readonly dryRun = signal<boolean | null>(null);

  refresh(): void {
    this.api.general().subscribe((g) => this.dryRun.set(g.dryRun));
  }
}
