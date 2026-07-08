import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ApiService } from '../core/api.service';
import {
  CustomRule,
  CustomRuleField,
  CustomRuleFieldsResponse,
  CustomRulePreview,
  Rule,
} from '../core/models';
import { BytesPipe } from '../core/pipes';

/** Human labels for built-in rule parameter keys. */
const PARAM_LABELS: Record<string, string> = {
  minAgeDays: 'Min. age (days)',
  minDaysSincePlay: 'Days since last play',
  minIdleDays: 'Idle days',
  minSizeGb: 'Min size (GB)',
  maxPlays: 'Max plays',
  maxRating: 'Max rating (0–10)',
  minWatchedPct: 'Min watched (%)',
  maxDaysSinceNewEpisode: 'New episode within (days)',
  points: 'Score points',
};

function blankRule(): CustomRule {
  return {
    name: '',
    appliesTo: 'both',
    match: 'all',
    conditions: [{ field: 'playCount', operator: 'eq', value: 0 }],
    points: 30,
    enabled: true,
  };
}

@Component({
  selector: 'app-rules-page',
  imports: [
    FormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatTooltipModule,
    BytesPipe,
  ],
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

      <!-- ─────────── Custom rules ─────────── -->
      <div class="custom-head">
        <div>
          <h2 class="section-title">Your rules</h2>
          <p class="muted section-sub">
            Build your own conditions over the same scan data. Unknown values never match, and
            conditions needing data your server can't report are skipped automatically.
          </p>
        </div>
        @if (!editing()) {
          <button matButton="filled" (click)="newRule()"><mat-icon>add</mat-icon> New rule</button>
        }
      </div>

      @for (rule of customRules(); track rule.id) {
        @if (editing()?.id !== rule.id) {
          <div class="custom-card" [class.disabled]="!rule.enabled">
            <div class="rule-head">
              <div>
                <div class="rule-name">{{ rule.name }}</div>
                <div class="muted custom-summary">
                  {{ rule.appliesTo === 'both' ? 'movies & shows' : rule.appliesTo + 's' }} ·
                  {{ rule.match === 'all' ? 'ALL' : 'ANY' }} of {{ rule.conditions.length }}
                  condition(s) · {{ rule.points }} points
                </div>
              </div>
              <div class="custom-actions">
                <mat-slide-toggle [(ngModel)]="rule.enabled" (change)="quickToggle(rule)" />
                <button matIconButton matTooltip="Edit" (click)="edit(rule)"><mat-icon>edit</mat-icon></button>
                <button matIconButton matTooltip="Delete" class="danger" (click)="remove(rule)">
                  <mat-icon>delete</mat-icon>
                </button>
              </div>
            </div>
            <div class="cond-chips">
              @for (cond of rule.conditions; track $index) {
                <span class="cond-chip">{{ describe(cond.field, cond.operator, cond.value) }}</span>
              }
            </div>
          </div>
        }
      }
      @if (!customRules().length && !editing()) {
        <p class="muted">No custom rules yet.</p>
      }

      <!-- editor -->
      @if (editing(); as rule) {
        <div class="custom-card editor">
          <div class="row">
            <mat-form-field appearance="outline" class="grow">
              <mat-label>Rule name</mat-label>
              <input matInput [(ngModel)]="rule.name" placeholder="Kids shelf-warmers" />
            </mat-form-field>
            <mat-form-field appearance="outline" class="w140">
              <mat-label>Applies to</mat-label>
              <mat-select [(ngModel)]="rule.appliesTo" (selectionChange)="clearPreview()">
                <mat-option value="both">Movies & shows</mat-option>
                <mat-option value="movie">Movies</mat-option>
                <mat-option value="show">Shows</mat-option>
              </mat-select>
            </mat-form-field>
            <mat-form-field appearance="outline" class="w140">
              <mat-label>Match</mat-label>
              <mat-select [(ngModel)]="rule.match" (selectionChange)="clearPreview()">
                <mat-option value="all">ALL conditions</mat-option>
                <mat-option value="any">ANY condition</mat-option>
              </mat-select>
            </mat-form-field>
            <mat-form-field appearance="outline" class="w140">
              <mat-label>Points</mat-label>
              <input matInput type="number" [(ngModel)]="rule.points" />
            </mat-form-field>
          </div>

          @for (cond of rule.conditions; track $index; let i = $index) {
            <div class="row cond-row">
              <mat-form-field appearance="outline" class="grow">
                <mat-label>Field</mat-label>
                <mat-select [ngModel]="cond.field" (ngModelChange)="setField(cond, $event)">
                  @for (field of fieldsFor(rule.appliesTo); track field.key) {
                    <mat-option [value]="field.key" [matTooltip]="field.description">
                      {{ field.label }}
                    </mat-option>
                  }
                </mat-select>
              </mat-form-field>
              <mat-form-field appearance="outline" class="w140">
                <mat-label>Operator</mat-label>
                <mat-select [(ngModel)]="cond.operator" (selectionChange)="clearPreview()">
                  @for (op of operatorsFor(cond.field); track op.key) {
                    <mat-option [value]="op.key">{{ op.label }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>
              @if (fieldMeta(cond.field)?.type === 'enum') {
                <mat-form-field appearance="outline" class="grow">
                  <mat-label>Value</mat-label>
                  <mat-select [(ngModel)]="cond.value" (selectionChange)="clearPreview()">
                    @for (v of fieldMeta(cond.field)?.enumValues ?? []; track v) {
                      <mat-option [value]="v">{{ v }}</mat-option>
                    }
                  </mat-select>
                </mat-form-field>
              } @else {
                <mat-form-field appearance="outline" class="grow">
                  <mat-label>Value</mat-label>
                  <input
                    matInput
                    [type]="fieldMeta(cond.field)?.type === 'number' ? 'number' : 'text'"
                    [(ngModel)]="cond.value"
                    (change)="clearPreview()"
                  />
                </mat-form-field>
              }
              <button matIconButton (click)="removeCondition(rule, i)" [disabled]="rule.conditions.length === 1">
                <mat-icon>delete</mat-icon>
              </button>
            </div>
          }

          <div class="row">
            <button matButton (click)="addCondition(rule)"><mat-icon>add</mat-icon> Add condition</button>
            <span class="spacer"></span>
            <button matButton (click)="preview(rule)" [disabled]="previewing()">
              <mat-icon>visibility</mat-icon> {{ previewing() ? 'Previewing…' : 'Preview' }}
            </button>
            <button matButton (click)="cancelEdit()">Cancel</button>
            <button matButton="filled" (click)="saveCustom(rule)" [disabled]="!rule.name">Save rule</button>
          </div>

          @if (previewResult(); as p) {
            <div class="preview-box">
              <div class="preview-headline">
                Would match <b>{{ p.matchCount }}</b> of {{ p.itemCount }} items ·
                <b>{{ p.totalSizeBytes | bytes }}</b>
              </div>
              @for (m of p.sample; track m.title) {
                <div class="preview-item">
                  <span class="preview-title">{{ m.title }}@if (m.year) { ({{ m.year }})}</span>
                  <span class="muted"> — {{ m.libraryName }} · {{ m.sizeBytes | bytes }}</span>
                  <div class="muted preview-reason">{{ m.reason }}</div>
                </div>
              }
              @if (p.matchCount > p.sample.length) {
                <div class="muted">…and {{ p.matchCount - p.sample.length }} more</div>
              }
              @if (p.itemCount === 0) {
                <div class="muted">No completed scan yet — run a scan first to preview against real data.</div>
              }
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: `
    .rules-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 380px), 1fr)); gap: 16px; }
    .rule-card, .custom-card { border-radius: 14px; background: var(--mat-sys-surface-container); padding: 18px 20px;
      transition: opacity 0.2s; }
    .rule-card.disabled, .custom-card.disabled { opacity: 0.55; }
    .rule-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    .rule-name { font: var(--mat-sys-title-medium); }
    .rule-desc { font: var(--mat-sys-body-medium); margin: 8px 0 4px; }
    .rule-req { display: flex; align-items: center; gap: 4px; font: var(--mat-sys-label-small);
      color: var(--mat-sys-tertiary); margin-bottom: 4px; }
    .param-row { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 10px; }
    .param-field { width: 150px; }

    .custom-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px;
      margin: 40px 0 12px; }
    .section-title { font: var(--mat-sys-title-large); margin: 0; }
    .section-sub { margin: 4px 0 0; max-width: 640px; }
    .custom-card { margin-bottom: 12px; }
    .custom-card.editor { border: 1px solid var(--mat-sys-primary); }
    .custom-summary { font: var(--mat-sys-body-small); margin-top: 2px; }
    .custom-actions { display: flex; align-items: center; gap: 4px; }
    .cond-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
    .cond-chip { font: var(--mat-sys-label-medium); border: 1px solid var(--mat-sys-outline-variant);
      border-radius: 999px; padding: 3px 10px; color: var(--mat-sys-on-surface-variant); }
    .row { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; margin-top: 6px; }
    .grow { flex: 1; min-width: 180px; }
    .w140 { width: 150px; }
    .danger { color: var(--mat-sys-error); }
    .preview-box { margin-top: 14px; border-radius: 10px; padding: 14px 16px;
      background: var(--mat-sys-surface-container-low); border: 1px dashed var(--mat-sys-outline-variant); }
    .preview-headline { font: var(--mat-sys-body-large); margin-bottom: 10px; }
    .preview-item { margin-bottom: 8px; }
    .preview-title { font: var(--mat-sys-body-medium); }
    .preview-reason { font: var(--mat-sys-body-small); }
  `,
})
export class RulesPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly snack = inject(MatSnackBar);

  readonly rules = signal<Rule[]>([]);
  readonly customRules = signal<CustomRule[]>([]);
  readonly editing = signal<CustomRule | null>(null);
  readonly previewResult = signal<CustomRulePreview | null>(null);
  readonly previewing = signal(false);
  private fieldsMeta: CustomRuleFieldsResponse = { fields: [], operators: {} };

  ngOnInit(): void {
    this.api.rules().subscribe((rules) => this.rules.set(rules));
    this.api.customRules().subscribe((rules) => this.customRules.set(rules));
    this.api.customRuleFields().subscribe((meta) => (this.fieldsMeta = meta));
  }

  // ── built-in rules ──
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

  // ── custom rules ──
  fieldsFor(appliesTo: CustomRule['appliesTo']): CustomRuleField[] {
    return this.fieldsMeta.fields.filter(
      (f) => f.appliesTo === 'both' || appliesTo === f.appliesTo || appliesTo === 'both',
    );
  }
  fieldMeta(key: string): CustomRuleField | undefined {
    return this.fieldsMeta.fields.find((f) => f.key === key);
  }
  operatorsFor(fieldKey: string): { key: string; label: string }[] {
    const meta = this.fieldMeta(fieldKey);
    return meta ? (this.fieldsMeta.operators[meta.type] ?? []) : [];
  }
  describe(field: string, operator: string, value: number | string): string {
    const meta = this.fieldMeta(field);
    const op = this.operatorsFor(field).find((o) => o.key === operator);
    return `${meta?.label ?? field} ${op?.label ?? operator} ${value}`;
  }

  newRule(): void {
    this.editing.set(blankRule());
    this.previewResult.set(null);
  }
  edit(rule: CustomRule): void {
    this.editing.set(structuredClone(rule));
    this.previewResult.set(null);
  }
  cancelEdit(): void {
    this.editing.set(null);
    this.previewResult.set(null);
  }

  setField(cond: CustomRule['conditions'][0], fieldKey: string): void {
    cond.field = fieldKey;
    const meta = this.fieldMeta(fieldKey);
    cond.operator = this.operatorsFor(fieldKey)[0]?.key ?? 'eq';
    cond.value = meta?.type === 'number' ? 0 : (meta?.enumValues?.[0] ?? '');
    this.clearPreview();
  }
  addCondition(rule: CustomRule): void {
    rule.conditions.push({ field: 'playCount', operator: 'eq', value: 0 });
    this.editing.update((r) => (r ? { ...r } : r));
    this.clearPreview();
  }
  removeCondition(rule: CustomRule, index: number): void {
    rule.conditions.splice(index, 1);
    this.editing.update((r) => (r ? { ...r } : r));
    this.clearPreview();
  }
  clearPreview(): void {
    this.previewResult.set(null);
  }

  preview(rule: CustomRule): void {
    this.previewing.set(true);
    this.api.previewCustomRule(this.normalize(rule)).subscribe({
      next: (result) => {
        this.previewing.set(false);
        this.previewResult.set(result);
      },
      error: (err) => {
        this.previewing.set(false);
        this.snack.open(this.errMsg(err), 'OK', { duration: 7000 });
      },
    });
  }

  saveCustom(rule: CustomRule): void {
    this.api.saveCustomRule(this.normalize(rule)).subscribe({
      next: () => {
        this.snack.open(`Saved "${rule.name}" — applies from the next scan`, 'OK', { duration: 4000 });
        this.editing.set(null);
        this.previewResult.set(null);
        this.api.customRules().subscribe((rules) => this.customRules.set(rules));
      },
      error: (err) => this.snack.open(this.errMsg(err), 'OK', { duration: 7000 }),
    });
  }

  quickToggle(rule: CustomRule): void {
    this.api.saveCustomRule(rule).subscribe();
  }

  remove(rule: CustomRule): void {
    if (!rule.id || !confirm(`Delete rule "${rule.name}"?`)) return;
    this.api.deleteCustomRule(rule.id).subscribe(() =>
      this.customRules.update((list) => list.filter((r) => r.id !== rule.id)),
    );
  }

  /** Coerce number-typed condition values (inputs hand back strings). */
  private normalize(rule: CustomRule): CustomRule {
    return {
      ...rule,
      points: Number(rule.points),
      conditions: rule.conditions.map((c) => ({
        ...c,
        value: this.fieldMeta(c.field)?.type === 'number' ? Number(c.value) : c.value,
      })),
    };
  }

  private errMsg(err: { error?: { message?: string | string[] } }): string {
    const m = err?.error?.message;
    return Array.isArray(m) ? m.join('; ') : (m ?? 'Request failed');
  }
}
