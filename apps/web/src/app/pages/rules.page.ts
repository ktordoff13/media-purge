import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ApiService } from '../core/api.service';
import { Rule } from '../core/models';

/** Human labels for rule parameter keys. */
const PARAM_LABELS: Record<string, string> = {
  minAgeDays: 'Min. age (days)',
  minDaysSincePlay: 'Days since last play',
  maxProgressPct: 'Max progress (%)',
  minIdleDays: 'Idle days',
  minSizeGb: 'Min size (GB)',
  maxPlays: 'Max plays',
  maxRating: 'Max rating (0–10)',
  minWatchedPct: 'Min watched (%)',
  maxDaysSinceNewEpisode: 'New episode within (days)',
  points: 'Score points',
};

@Component({
  selector: 'app-rules-page',
  imports: [FormsModule, MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule, MatSlideToggleModule, MatTooltipModule],
  template: `
    <div class="page">
      <h1 class="page-title">Cleanup rules</h1>
      <p class="page-subtitle">
        No AI, no magic — plain heuristics you can read and tune. Each matched rule adds points;
        items past the score threshold become recommendations on the next scan.
      </p>

      <div class="rules-grid">
        @for (rule of rules(); track rule.key) {
          <div class="rule-card" [class.disabled]="!rule.enabled">
            <div class="rule-head">
              <div class="rule-name">{{ rule.name }}</div>
              <mat-slide-toggle [(ngModel)]="rule.enabled" (change)="save(rule)" />
            </div>
            <p class="rule-desc muted">{{ rule.description }}</p>
            @if (rule.requires.length) {
              <div class="rule-req" matTooltip="Only applies to media sources whose server reports this data">
                <mat-icon inline>info</mat-icon> needs: {{ rule.requires.join(', ') }}
              </div>
            }
            <div class="param-row">
              @for (param of paramKeys(rule); track param) {
                <mat-form-field appearance="outline" class="param-field">
                  <mat-label>{{ label(param) }}</mat-label>
                  <input
                    matInput
                    type="number"
                    [ngModel]="rule.params[param]"
                    (ngModelChange)="rule.params[param] = $event"
                    (change)="save(rule)"
                  />
                </mat-form-field>
              }
            </div>
          </div>
        }
      </div>
    </div>
  `,
  styles: `
    .rules-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(380px, 1fr)); gap: 16px; }
    .rule-card { border-radius: 14px; background: var(--mat-sys-surface-container); padding: 18px 20px;
      transition: opacity 0.2s; }
    .rule-card.disabled { opacity: 0.55; }
    .rule-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    .rule-name { font: var(--mat-sys-title-medium); }
    .rule-desc { font: var(--mat-sys-body-medium); margin: 8px 0 4px; }
    .rule-req { display: flex; align-items: center; gap: 4px; font: var(--mat-sys-label-small);
      color: var(--mat-sys-tertiary); margin-bottom: 4px; }
    .param-row { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 10px; }
    .param-field { width: 150px; }
  `,
})
export class RulesPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly snack = inject(MatSnackBar);

  readonly rules = signal<Rule[]>([]);

  ngOnInit(): void {
    this.api.rules().subscribe((rules) => this.rules.set(rules));
  }

  paramKeys(rule: Rule): string[] {
    return Object.keys(rule.params);
  }

  label(param: string): string {
    return PARAM_LABELS[param] ?? param;
  }

  save(rule: Rule): void {
    this.api.updateRule(rule.key, { enabled: rule.enabled, params: rule.params }).subscribe({
      next: () => this.snack.open(`Saved "${rule.name}" — applies from the next scan`, 'OK', { duration: 3000 }),
      error: () => this.snack.open('Save failed', 'OK', { duration: 5000 }),
    });
  }
}
