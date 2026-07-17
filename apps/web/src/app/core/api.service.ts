import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  ActivityEntry,
  AiSettings,
  ArrSettings,
  ConnectionTestResult,
  CustomRule,
  CustomRuleFieldsResponse,
  CustomRulePreview,
  Dashboard,
  GeneralSettings,
  HealthInfo,
  MaintenanceOperation,
  MaintenanceSettings,
  MediaSource,
  PathMapping,
  ProtectedItem,
  ProviderType,
  PurgeQueueState,
  Recommendation,
  RecommendationStatus,
  RecycleBinEntry,
  RemoteLibrary,
  Rule,
  Scan,
  SecuritySettings,
  SetupStatus,
} from './models';

const BASE = '/api/v1';

function stripId<T extends { id?: number }>(obj: T): Omit<T, 'id'> {
  const { id: _id, ...rest } = obj;
  return rest;
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);

  health(): Observable<HealthInfo> {
    return this.http.get<HealthInfo>(`${BASE}/health`);
  }

  // Dashboard / scans
  dashboard(): Observable<Dashboard> {
    return this.http.get<Dashboard>(`${BASE}/stats/dashboard`);
  }
  setupStatus(): Observable<SetupStatus> {
    return this.http.get<SetupStatus>(`${BASE}/stats/setup`);
  }
  startScan(): Observable<Scan> {
    return this.http.post<Scan>(`${BASE}/scans`, {});
  }
  latestScan(): Observable<{ scan: Scan | null; running: boolean }> {
    return this.http.get<{ scan: Scan | null; running: boolean }>(`${BASE}/scans/latest`);
  }

  // Recommendations
  recommendations(opts: {
    status?: RecommendationStatus;
    sort?: 'score' | 'size';
    library?: string;
  }): Observable<Recommendation[]> {
    const params: Record<string, string> = {};
    if (opts.status) params['status'] = opts.status;
    if (opts.sort) params['sort'] = opts.sort;
    if (opts.library) params['library'] = opts.library;
    return this.http.get<Recommendation[]>(`${BASE}/recommendations`, { params });
  }
  approve(id: number): Observable<{ dryRun: boolean; message: string }> {
    return this.http.post<{ dryRun: boolean; message: string }>(`${BASE}/recommendations/${id}/approve`, {});
  }
  dismiss(id: number): Observable<unknown> {
    return this.http.post(`${BASE}/recommendations/${id}/dismiss`, {});
  }
  protect(id: number): Observable<unknown> {
    return this.http.post(`${BASE}/recommendations/${id}/protect`, {});
  }
  bulk(ids: number[], action: 'approve' | 'dismiss') {
    return this.http.post<{ results: { id: number; ok: boolean; message?: string }[] }>(
      `${BASE}/recommendations/bulk`,
      { ids, action },
    );
  }
  purgeEnqueue(ids: number[]): Observable<PurgeQueueState> {
    return this.http.post<PurgeQueueState>(`${BASE}/recommendations/queue`, { ids });
  }
  purgeQueue(): Observable<PurgeQueueState> {
    return this.http.get<PurgeQueueState>(`${BASE}/recommendations/queue`);
  }
  purgeCancel(): Observable<PurgeQueueState> {
    return this.http.delete<PurgeQueueState>(`${BASE}/recommendations/queue`);
  }
  posterUrl(itemId: number): string {
    return `${BASE}/items/${itemId}/poster`;
  }

  // Rules
  rules(): Observable<Rule[]> {
    return this.http.get<Rule[]>(`${BASE}/rules`);
  }
  updateRule(key: string, patch: { enabled?: boolean; params?: Record<string, number> }) {
    return this.http.put(`${BASE}/rules/${key}`, patch);
  }

  // Custom rules
  customRuleFields(): Observable<CustomRuleFieldsResponse> {
    return this.http.get<CustomRuleFieldsResponse>(`${BASE}/custom-rules/fields`);
  }
  customRules(): Observable<CustomRule[]> {
    return this.http.get<CustomRule[]>(`${BASE}/custom-rules`);
  }
  saveCustomRule(rule: CustomRule): Observable<CustomRule> {
    return rule.id
      ? this.http.put<CustomRule>(`${BASE}/custom-rules/${rule.id}`, stripId(rule))
      : this.http.post<CustomRule>(`${BASE}/custom-rules`, stripId(rule));
  }
  deleteCustomRule(id: number) {
    return this.http.delete(`${BASE}/custom-rules/${id}`);
  }
  previewCustomRule(rule: CustomRule): Observable<CustomRulePreview> {
    return this.http.post<CustomRulePreview>(`${BASE}/custom-rules/preview`, stripId(rule));
  }

  // Recycle bin
  recycleBin(): Observable<RecycleBinEntry[]> {
    return this.http.get<RecycleBinEntry[]>(`${BASE}/recycle-bin`);
  }
  restore(id: number) {
    return this.http.post(`${BASE}/recycle-bin/${id}/restore`, {});
  }
  purge(id: number) {
    return this.http.post(`${BASE}/recycle-bin/${id}/purge`, {});
  }

  // Activity
  activity(type?: string): Observable<{ items: ActivityEntry[]; total: number }> {
    const params: Record<string, string> = { limit: '200' };
    if (type) params['type'] = type;
    return this.http.get<{ items: ActivityEntry[]; total: number }>(`${BASE}/activity`, { params });
  }

  // Protected items
  protectedItems(): Observable<ProtectedItem[]> {
    return this.http.get<ProtectedItem[]>(`${BASE}/protected-items`);
  }
  unprotect(id: number) {
    return this.http.delete(`${BASE}/protected-items/${id}`);
  }

  // Sources
  providerTypes(): Observable<ProviderType[]> {
    return this.http.get<ProviderType[]>(`${BASE}/sources/provider-types`);
  }
  sources(): Observable<MediaSource[]> {
    return this.http.get<MediaSource[]>(`${BASE}/sources`);
  }
  createSource(source: Partial<MediaSource>) {
    return this.http.post<MediaSource>(`${BASE}/sources`, source);
  }
  updateSource(id: number, source: Partial<MediaSource>) {
    return this.http.put<MediaSource>(`${BASE}/sources/${id}`, source);
  }
  deleteSource(id: number) {
    return this.http.delete(`${BASE}/sources/${id}`);
  }
  testSource(id: number): Observable<ConnectionTestResult> {
    return this.http.post<ConnectionTestResult>(`${BASE}/sources/${id}/test`, {});
  }
  testSourceConfig(config: Partial<MediaSource>): Observable<ConnectionTestResult> {
    return this.http.post<ConnectionTestResult>(`${BASE}/sources/test`, config);
  }
  libraries(sourceId: number): Observable<RemoteLibrary[]> {
    return this.http.get<RemoteLibrary[]>(`${BASE}/sources/${sourceId}/libraries`);
  }

  // Settings
  general(): Observable<GeneralSettings> {
    return this.http.get<GeneralSettings>(`${BASE}/settings/general`);
  }
  saveGeneral(s: GeneralSettings) {
    return this.http.put(`${BASE}/settings/general`, s);
  }
  pathMappings(): Observable<{ mappings: PathMapping[] }> {
    return this.http.get<{ mappings: PathMapping[] }>(`${BASE}/settings/path-mappings`);
  }
  savePathMappings(mappings: PathMapping[]) {
    return this.http.put(`${BASE}/settings/path-mappings`, { mappings });
  }
  arr(kind: 'radarr' | 'sonarr'): Observable<ArrSettings> {
    return this.http.get<ArrSettings>(`${BASE}/settings/${kind}`);
  }
  saveArr(kind: 'radarr' | 'sonarr', s: ArrSettings) {
    return this.http.put(`${BASE}/settings/${kind}`, s);
  }
  testArr(kind: 'radarr' | 'sonarr'): Observable<ConnectionTestResult> {
    return this.http.post<ConnectionTestResult>(`${BASE}/integrations/${kind}/test`, {});
  }
  maintenanceSettings(): Observable<MaintenanceSettings> {
    return this.http.get<MaintenanceSettings>(`${BASE}/settings/maintenance`);
  }
  saveMaintenanceSettings(s: MaintenanceSettings) {
    return this.http.put(`${BASE}/settings/maintenance`, s);
  }
  security(): Observable<SecuritySettings> {
    return this.http.get<SecuritySettings>(`${BASE}/settings/security`);
  }
  saveSecurity(s: SecuritySettings) {
    return this.http.put(`${BASE}/settings/security`, s);
  }

  // AI advisor
  aiSettings(): Observable<AiSettings> {
    return this.http.get<AiSettings>(`${BASE}/settings/ai`);
  }
  saveAiSettings(s: AiSettings) {
    return this.http.put(`${BASE}/settings/ai`, s);
  }
  testAi(): Observable<ConnectionTestResult> {
    return this.http.post<ConnectionTestResult>(`${BASE}/integrations/ai/test`, {});
  }
  aiAdvise() {
    return this.http.post<{ started: boolean; message: string }>(`${BASE}/integrations/ai/advise`, {});
  }

  // Maintenance
  maintenanceOps(sourceId: number): Observable<MaintenanceOperation[]> {
    return this.http.get<MaintenanceOperation[]>(`${BASE}/maintenance/${sourceId}/operations`);
  }
  runMaintenance(sourceId: number, operation: string) {
    return this.http.post<{ message: string; bytesFreed: number; dryRun: boolean }>(
      `${BASE}/maintenance/${sourceId}/run`,
      { operation },
    );
  }
}
