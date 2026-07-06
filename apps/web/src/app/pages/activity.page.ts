import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ApiService } from '../core/api.service';
import { ActivityEntry } from '../core/models';
import { BytesPipe } from '../core/pipes';

const TYPE_ICONS: Record<string, string> = {
  'scan.started': 'radar',
  'scan.completed': 'radar',
  'scan.failed': 'error',
  'recommendation.created': 'lightbulb',
  'recommendation.approved': 'check_circle',
  'recommendation.dismissed': 'do_not_disturb_on',
  'item.protected': 'shield',
  'item.unprotected': 'remove_moderator',
  'bin.moved': 'delete',
  'bin.restored': 'restore',
  'bin.purged': 'delete_forever',
  'arr.deleted': 'link',
  'maintenance.cache-purged': 'cleaning_services',
  'maintenance.task-run': 'build',
  'settings.updated': 'settings',
};

@Component({
  selector: 'app-activity-page',
  imports: [FormsModule, MatButtonModule, MatFormFieldModule, MatIconModule, MatSelectModule, MatTooltipModule, BytesPipe, DatePipe],
  template: `
    <div class="page">
      <div class="header-row">
        <div>
          <h1 class="page-title">Activity log</h1>
          <p class="page-subtitle">The permanent record: what was deleted, when, and why.</p>
        </div>
        <a matButton href="/api/v1/activity/export.csv" download>
          <mat-icon>download</mat-icon> Export CSV
        </a>
      </div>

      <mat-form-field appearance="outline" class="type-filter">
        <mat-label>Filter by type</mat-label>
        <mat-select [(ngModel)]="type" (selectionChange)="load()">
          <mat-option [value]="''">All activity</mat-option>
          @for (t of types; track t) {
            <mat-option [value]="t">{{ t }}</mat-option>
          }
        </mat-select>
      </mat-form-field>

      @if (!items().length) {
        <div class="empty">
          <mat-icon>history</mat-icon>
          <p>No activity yet.</p>
        </div>
      }

      <div class="timeline">
        @for (entry of items(); track entry.id) {
          <div class="event">
            <mat-icon class="event-icon" [class.dry]="entry.dryRun" [class.destructive]="entry.type === 'bin.purged'">
              {{ icon(entry.type) }}
            </mat-icon>
            <div class="event-body">
              <div class="event-message">
                @if (entry.dryRun) {
                  <span class="dry-tag">DRY RUN</span>
                }
                {{ entry.message }}
              </div>
              <div class="muted event-meta">
                {{ entry.createdAt | date: 'medium' }} · {{ entry.type }}
                @if (entry.bytesFreed > 0) {
                  · freed {{ entry.bytesFreed | bytes }}
                }
              </div>
            </div>
          </div>
        }
      </div>
    </div>
  `,
  styles: `
    .header-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
    .type-filter { width: 280px; }
    .timeline { display: flex; flex-direction: column; }
    .event { display: flex; gap: 14px; padding: 10px 4px; border-bottom: 1px solid var(--mat-sys-outline-variant); }
    .event-icon { color: var(--mat-sys-on-surface-variant); margin-top: 2px; }
    .event-icon.destructive { color: var(--mat-sys-error); }
    .event-icon.dry { color: var(--mat-sys-tertiary); }
    .event-message { font: var(--mat-sys-body-large); }
    .event-meta { font: var(--mat-sys-body-small); margin-top: 2px; }
    .dry-tag { font: var(--mat-sys-label-small); background: color-mix(in srgb, var(--mat-sys-tertiary) 25%, transparent);
      color: var(--mat-sys-tertiary); border-radius: 4px; padding: 1px 6px; margin-right: 6px; }
    .empty { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 64px 0;
      color: var(--mat-sys-on-surface-variant);
      mat-icon { font-size: 44px; width: 44px; height: 44px; } }
  `,
})
export class ActivityPage implements OnInit {
  private readonly api = inject(ApiService);

  type = '';
  readonly types = Object.keys(TYPE_ICONS);
  readonly items = signal<ActivityEntry[]>([]);

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.api.activity(this.type || undefined).subscribe(({ items }) => this.items.set(items));
  }

  icon(type: string): string {
    return TYPE_ICONS[type] ?? 'circle';
  }
}
