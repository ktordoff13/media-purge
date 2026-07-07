import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ApiService } from '../core/api.service';
import {
  ArrSettings,
  GeneralSettings,
  MaintenanceSettings,
  MediaSource,
  PathMapping,
  ProtectedItem,
  ProviderType,
  SecuritySettings,
} from '../core/models';

interface EditableSource extends Partial<MediaSource> {
  testResult?: string;
  testOk?: boolean;
}

@Component({
  selector: 'app-settings-page',
  imports: [
    FormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatTabsModule,
    MatTooltipModule,
  ],
  template: `
    <div class="page">
      <h1 class="page-title">Settings</h1>
      <p class="page-subtitle">Connections, safety switches, and path mappings.</p>

      <mat-tab-group>
        <!-- ─────────── Media sources ─────────── -->
        <mat-tab label="Media sources">
          <div class="tab-body">
            @for (source of sources(); track source.id ?? $index) {
              <div class="card">
                <div class="row">
                  <mat-form-field appearance="outline" class="grow">
                    <mat-label>Name</mat-label>
                    <input matInput [(ngModel)]="source.name" placeholder="Living-room Plex" />
                  </mat-form-field>
                  <mat-form-field appearance="outline">
                    <mat-label>Type</mat-label>
                    <mat-select [(ngModel)]="source.type">
                      @for (pt of providerTypes(); track pt.type) {
                        <mat-option [value]="pt.type">{{ pt.displayName }}</mat-option>
                      }
                    </mat-select>
                  </mat-form-field>
                  <mat-slide-toggle [(ngModel)]="source.enabled">Enabled</mat-slide-toggle>
                </div>
                <div class="row">
                  <mat-form-field appearance="outline" class="grow">
                    <mat-label>Server URL</mat-label>
                    <input matInput [(ngModel)]="source.baseUrl" placeholder="http://192.168.1.10:32400" />
                  </mat-form-field>
                  <mat-form-field appearance="outline" class="grow">
                    <mat-label>{{ source.type === 'plex' ? 'X-Plex-Token' : 'API key (admin)' }}</mat-label>
                    <input matInput [(ngModel)]="source.token" type="password" />
                    <mat-icon
                      matSuffix
                      [matTooltip]="source.type === 'plex'
                        ? 'Find it via Plex Web: play an item → ⋮ → Get Info → View XML → X-Plex-Token in the URL'
                        : 'Jellyfin Dashboard → Advanced → API Keys. Must be an admin key so watch state can be read for all users.'"
                    >help</mat-icon>
                  </mat-form-field>
                </div>
                <div class="row actions-row">
                  @if (source.testResult) {
                    <span [class.ok]="source.testOk" [class.fail]="!source.testOk" class="test-result">
                      {{ source.testResult }}
                    </span>
                  }
                  <span class="spacer"></span>
                  <button matButton (click)="testSource(source)" [disabled]="!source.baseUrl || !source.token">
                    <mat-icon>network_check</mat-icon> Test
                  </button>
                  @if (source.id) {
                    <button matButton class="danger" (click)="deleteSource(source)"><mat-icon>delete</mat-icon> Remove</button>
                  }
                  <button matButton="filled" (click)="saveSource(source)">
                    {{ source.id ? 'Save' : 'Add source' }}
                  </button>
                </div>
              </div>
            }
            <button matButton (click)="addSource()"><mat-icon>add</mat-icon> Add media source</button>
          </div>
        </mat-tab>

        <!-- ─────────── General ─────────── -->
        <mat-tab label="General">
          <div class="tab-body">
            @if (general(); as g) {
              <div class="card">
                <div class="dry-run-row" [class.armed]="!g.dryRun">
                  <div>
                    <div class="dry-run-title">
                      <mat-icon>{{ g.dryRun ? 'science' : 'warning' }}</mat-icon>
                      Dry-run mode {{ g.dryRun ? 'ON' : 'OFF' }}
                    </div>
                    <div class="muted">
                      @if (g.dryRun) {
                        Approvals and maintenance are simulated and logged — no file is touched. Turn off when you trust your setup.
                      } @else {
                        Deletions are live. Approved items move to the recycle bin and purge after {{ g.retentionDays }} days.
                      }
                    </div>
                  </div>
                  <mat-slide-toggle [ngModel]="g.dryRun" (ngModelChange)="g.dryRun = $event; saveGeneral()" />
                </div>
              </div>
              <div class="card">
                <div class="row">
                  <mat-form-field appearance="outline" class="grow">
                    <mat-label>Recycle bin directory</mat-label>
                    <input matInput [(ngModel)]="g.recycleBinDir" (change)="saveGeneral()" />
                    <mat-icon matSuffix matTooltip="Must be on the same unraid share/pool as your media for instant moves">info</mat-icon>
                  </mat-form-field>
                  <mat-form-field appearance="outline">
                    <mat-label>Retention (days)</mat-label>
                    <input matInput type="number" min="1" [(ngModel)]="g.retentionDays" (change)="saveGeneral()" />
                  </mat-form-field>
                  <mat-form-field appearance="outline">
                    <mat-label>Scan schedule (cron)</mat-label>
                    <input matInput [ngModel]="g.scanCron" (ngModelChange)="g.scanCron = $event || null" (change)="saveGeneral()" placeholder="0 3 * * 0" />
                    <mat-icon matSuffix matTooltip="Standard 5-field cron, e.g. '0 3 * * 0' = Sundays 03:00. Empty = disabled.">schedule</mat-icon>
                  </mat-form-field>
                </div>
              </div>
            }
          </div>
        </mat-tab>

        <!-- ─────────── Path mappings ─────────── -->
        <mat-tab label="Path mappings">
          <div class="tab-body">
            <p class="muted explain">
              Your media server reports file paths in <i>its</i> container's namespace; this app needs
              them in <i>its own</i>. Example: Plex sees <code>/data/media/movies</code>, this container
              mounts the same share at <code>/media/movies</code> → map <code>/data/media</code> →
              <code>/media</code>. If both containers use identical mounts, leave this empty.
            </p>
            @for (mapping of mappings(); track $index) {
              <div class="row">
                <mat-form-field appearance="outline" class="grow">
                  <mat-label>Media server path prefix</mat-label>
                  <input matInput [(ngModel)]="mapping.from" placeholder="/data/media" />
                </mat-form-field>
                <mat-icon class="arrow">arrow_forward</mat-icon>
                <mat-form-field appearance="outline" class="grow">
                  <mat-label>This container's path prefix</mat-label>
                  <input matInput [(ngModel)]="mapping.to" placeholder="/media" />
                </mat-form-field>
                <button matIconButton (click)="removeMapping($index)"><mat-icon>delete</mat-icon></button>
              </div>
            }
            <div class="row">
              <button matButton (click)="addMapping()"><mat-icon>add</mat-icon> Add mapping</button>
              <span class="spacer"></span>
              <button matButton="filled" (click)="saveMappings()">Save mappings</button>
            </div>
          </div>
        </mat-tab>

        <!-- ─────────── Integrations ─────────── -->
        <mat-tab label="Integrations">
          <div class="tab-body">
            @for (kind of ['radarr', 'sonarr']; track kind) {
              @if (arrOf(kind); as a) {
                <div class="card">
                  <div class="row">
                    <div class="arr-name">{{ kind === 'radarr' ? 'Radarr' : 'Sonarr' }}</div>
                    <mat-slide-toggle [(ngModel)]="a.enabled">
                      Unmonitor on approve (prevents re-downloads)
                    </mat-slide-toggle>
                  </div>
                  <div class="row">
                    <mat-form-field appearance="outline" class="grow">
                      <mat-label>URL</mat-label>
                      <input matInput [(ngModel)]="a.baseUrl" [placeholder]="kind === 'radarr' ? 'http://192.168.1.10:7878' : 'http://192.168.1.10:8989'" />
                    </mat-form-field>
                    <mat-form-field appearance="outline" class="grow">
                      <mat-label>API key</mat-label>
                      <input matInput [(ngModel)]="a.apiKey" type="password" />
                    </mat-form-field>
                    <button matButton (click)="testArr(kind)"><mat-icon>network_check</mat-icon> Test</button>
                    <button matButton="filled" (click)="saveArr(kind)">Save</button>
                  </div>
                </div>
              }
            }
          </div>
        </mat-tab>

        <!-- ─────────── Maintenance paths ─────────── -->
        <mat-tab label="Appdata paths">
          <div class="tab-body">
            <p class="muted explain">
              To let Maintenance purge image caches from disk, mount each server's appdata into this
              container and enter the path here. Plex: the folder containing <code>Cache/</code>, e.g.
              <code>/plex-appdata/Library/Application Support/Plex Media Server</code>. Jellyfin: its
              config dir — the folder containing <code>cache/</code>, e.g. <code>/jellyfin-appdata</code>.
              API-based maintenance tasks work without this.
            </p>
            @for (source of sources(); track source.id) {
              @if (source.id && maintenanceSettings(); as ms) {
                <div class="row">
                  <div class="appdata-source">{{ source.name }} ({{ source.type }})</div>
                  <mat-form-field appearance="outline" class="grow">
                    <mat-label>Appdata path inside this container</mat-label>
                    <input
                      matInput
                      [ngModel]="ms.appdataPaths[source.id]"
                      (ngModelChange)="ms.appdataPaths[source.id!] = $event"
                    />
                  </mat-form-field>
                </div>
              }
            }
            <div class="row">
              <span class="spacer"></span>
              <button matButton="filled" (click)="saveMaintenance()">Save appdata paths</button>
            </div>
          </div>
        </mat-tab>

        <!-- ─────────── Security & protected ─────────── -->
        <mat-tab label="Security">
          <div class="tab-body">
            @if (security(); as sec) {
              <div class="card">
                <div class="row">
                  <mat-form-field appearance="outline" class="grow">
                    <mat-label>API key (optional)</mat-label>
                    <input matInput [ngModel]="sec.apiKey" (ngModelChange)="sec.apiKey = $event || null" type="password" />
                    <mat-icon matSuffix matTooltip="When set, every API request must send this in the X-Api-Key header. Leave empty on a trusted LAN.">key</mat-icon>
                  </mat-form-field>
                  <button matButton="filled" (click)="saveSecurity()">Save</button>
                </div>
              </div>
            }
            <h3 class="section">Protected items</h3>
            @if (!protectedItems().length) {
              <p class="muted">None yet — use the shield button on a recommendation.</p>
            }
            @for (item of protectedItems(); track item.id) {
              <div class="row protected-row">
                <mat-icon class="shield">shield</mat-icon>
                <span class="grow">{{ item.title }}</span>
                <button matButton (click)="unprotect(item)">Remove protection</button>
              </div>
            }
          </div>
        </mat-tab>
      </mat-tab-group>
    </div>
  `,
  styles: `
    .tab-body { padding: 20px 4px; display: flex; flex-direction: column; gap: 14px; }
    .card { border-radius: 14px; background: var(--mat-sys-surface-container); padding: 16px 20px; }
    .row { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
    .grow { flex: 1; min-width: 220px; }
    .actions-row { margin-top: -8px; }
    .danger { color: var(--mat-sys-error); }
    .test-result { font: var(--mat-sys-body-medium); }
    .test-result.ok { color: var(--mat-sys-tertiary); }
    .test-result.fail { color: var(--mat-sys-error); }
    .dry-run-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
    .dry-run-row.armed .dry-run-title { color: var(--mat-sys-error); }
    .dry-run-title { display: flex; align-items: center; gap: 8px; font: var(--mat-sys-title-medium); margin-bottom: 4px; }
    .explain { max-width: 760px; line-height: 1.5; }
    .explain code { background: var(--mat-sys-surface-container-high); padding: 1px 6px; border-radius: 4px; }
    .arrow { color: var(--mat-sys-on-surface-variant); }
    .arr-name { font: var(--mat-sys-title-medium); width: 90px; }
    .appdata-source { width: 220px; font: var(--mat-sys-body-large); }
    .section { font: var(--mat-sys-title-medium); margin: 16px 0 4px; }
    .protected-row { border-bottom: 1px solid var(--mat-sys-outline-variant); padding: 4px 0; }
    .shield { color: var(--mat-sys-tertiary); }
  `,
})
export class SettingsPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly snack = inject(MatSnackBar);

  readonly sources = signal<EditableSource[]>([]);
  readonly providerTypes = signal<ProviderType[]>([]);
  readonly general = signal<GeneralSettings | null>(null);
  readonly mappings = signal<PathMapping[]>([]);
  readonly radarr = signal<ArrSettings | null>(null);
  readonly sonarr = signal<ArrSettings | null>(null);
  readonly maintenanceSettings = signal<MaintenanceSettings | null>(null);
  readonly security = signal<SecuritySettings | null>(null);
  readonly protectedItems = signal<ProtectedItem[]>([]);

  ngOnInit(): void {
    this.api.providerTypes().subscribe((types) => this.providerTypes.set(types));
    this.api.sources().subscribe((sources) => this.sources.set(sources));
    this.api.general().subscribe((g) => this.general.set(g));
    this.api.pathMappings().subscribe(({ mappings }) => this.mappings.set(mappings));
    this.api.arr('radarr').subscribe((a) => this.radarr.set(a));
    this.api.arr('sonarr').subscribe((a) => this.sonarr.set(a));
    this.api.maintenanceSettings().subscribe((ms) => this.maintenanceSettings.set(ms));
    this.api.security().subscribe((s) => this.security.set(s));
    this.api.protectedItems().subscribe((items) => this.protectedItems.set(items));
  }

  // Sources
  addSource(): void {
    this.sources.update((list) => [...list, { name: '', type: 'plex', baseUrl: '', token: '', enabled: true }]);
  }

  saveSource(source: EditableSource): void {
    const payload = {
      name: source.name,
      type: source.type,
      baseUrl: source.baseUrl,
      token: source.token,
      enabled: source.enabled ?? true,
      excludedLibraryIds: source.excludedLibraryIds ?? [],
    };
    const req = source.id ? this.api.updateSource(source.id, payload) : this.api.createSource(payload);
    req.subscribe({
      next: () => {
        this.snack.open('Source saved', 'OK', { duration: 3000 });
        this.api.sources().subscribe((sources) => this.sources.set(sources));
      },
      error: (err) => this.snack.open(this.errMsg(err), 'OK', { duration: 8000 }),
    });
  }

  testSource(source: EditableSource): void {
    this.setTestResult(source, undefined, 'Testing…');
    // Saved sources test by id; unsaved ones send the form values directly.
    const request = source.id
      ? this.api.testSource(source.id)
      : this.api.testSourceConfig({
          name: source.name || 'unsaved',
          type: source.type,
          baseUrl: source.baseUrl,
          token: source.token,
        });
    request.subscribe({
      next: (res) =>
        this.setTestResult(
          source,
          res.ok,
          res.ok ? `✓ ${res.serverName ?? 'Connected'} ${res.version ?? ''}` : `✗ ${res.message}`,
        ),
      error: (err) => this.setTestResult(source, false, `✗ ${this.errMsg(err)}`),
    });
  }

  /**
   * Test state lives on the row object, so re-emit the signal — the app is
   * zoneless and a bare property mutation would never reach the template.
   */
  private setTestResult(source: EditableSource, ok: boolean | undefined, message: string): void {
    source.testOk = ok;
    source.testResult = message;
    this.sources.update((list) => [...list]);
  }

  deleteSource(source: EditableSource): void {
    if (!source.id) return;
    if (!confirm(`Remove "${source.name}" and its scan history?`)) return;
    this.api.deleteSource(source.id).subscribe(() => {
      this.sources.update((list) => list.filter((s) => s !== source));
    });
  }

  // General
  saveGeneral(): void {
    const g = this.general();
    if (!g) return;
    this.api.saveGeneral(g).subscribe(() => this.snack.open('General settings saved', 'OK', { duration: 3000 }));
  }

  // Path mappings
  addMapping(): void {
    this.mappings.update((m) => [...m, { from: '', to: '' }]);
  }
  removeMapping(index: number): void {
    this.mappings.update((m) => m.filter((_, i) => i !== index));
  }
  saveMappings(): void {
    const clean = this.mappings().filter((m) => m.from && m.to);
    this.api.savePathMappings(clean).subscribe(() => {
      this.mappings.set(clean);
      this.snack.open('Path mappings saved', 'OK', { duration: 3000 });
    });
  }

  // Integrations
  arrOf(kind: string): ArrSettings | null {
    return kind === 'radarr' ? this.radarr() : this.sonarr();
  }
  saveArr(kind: string): void {
    const a = this.arrOf(kind);
    if (!a) return;
    this.api.saveArr(kind as 'radarr' | 'sonarr', a).subscribe(() =>
      this.snack.open(`${kind} settings saved`, 'OK', { duration: 3000 }),
    );
  }
  testArr(kind: string): void {
    this.api.testArr(kind as 'radarr' | 'sonarr').subscribe((res) =>
      this.snack.open(res.ok ? `✓ ${res.serverName} ${res.version}` : `✗ ${res.message}`, 'OK', { duration: 6000 }),
    );
  }

  // Maintenance
  saveMaintenance(): void {
    const ms = this.maintenanceSettings();
    if (!ms) return;
    this.api.saveMaintenanceSettings(ms).subscribe(() =>
      this.snack.open('Appdata paths saved', 'OK', { duration: 3000 }),
    );
  }

  // Security
  saveSecurity(): void {
    const sec = this.security();
    if (!sec) return;
    this.api.saveSecurity(sec).subscribe(() =>
      this.snack.open('Security settings saved', 'OK', { duration: 3000 }),
    );
  }

  unprotect(item: ProtectedItem): void {
    this.api.unprotect(item.id).subscribe(() =>
      this.protectedItems.update((list) => list.filter((p) => p.id !== item.id)),
    );
  }

  private errMsg(err: { error?: { message?: string | string[] } }): string {
    const m = err?.error?.message;
    return Array.isArray(m) ? m.join('; ') : (m ?? 'Request failed');
  }
}
