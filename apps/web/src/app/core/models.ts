/** Mirrors the API's DTOs. Keep in sync with apps/api (see /api/docs). */

export interface ProviderType {
  type: string;
  displayName: string;
  capabilities: Record<string, boolean>;
}

export interface MediaSource {
  id: number;
  name: string;
  type: string;
  baseUrl: string;
  token: string;
  enabled: boolean;
  excludedLibraryIds: string[];
}

export interface RemoteLibrary {
  id: string;
  name: string;
  mediaType: 'movie' | 'show';
}

export interface ConnectionTestResult {
  ok: boolean;
  message: string;
  serverName?: string;
  version?: string;
}

export interface Scan {
  id: number;
  status: 'running' | 'completed' | 'failed';
  error: string | null;
  itemCount: number;
  totalSizeBytes: number;
  recommendationCount: number;
  reclaimableBytes: number;
  startedAt: string;
  finishedAt: string | null;
}

export interface MediaItem {
  id: number;
  sourceId: number;
  providerItemId: string;
  libraryName: string;
  type: 'movie' | 'show';
  title: string;
  year: number | null;
  addedAt: string | null;
  lastPlayedAt: string | null;
  playCount: number;
  ratingCritic: number | null;
  ratingAudience: number | null;
  filePaths: string[];
  sizeBytes: number;
  resolution: string | null;
  versionCount: number;
  episodeCount: number | null;
  watchedEpisodeCount: number | null;
  thumbPath: string | null;
}

export interface RecommendationReason {
  ruleKey: string;
  ruleName: string;
  points: number;
  reason: string;
}

export type RecommendationStatus = 'open' | 'approved' | 'dismissed' | 'restored' | 'purged';

export interface Recommendation {
  id: number;
  scanId: number;
  status: RecommendationStatus;
  totalScore: number;
  reasons: RecommendationReason[];
  sizeBytes: number;
  aiNote: string | null;
  mediaItem: MediaItem;
}

export interface Rule {
  key: string;
  name: string;
  description: string;
  defaultParams: Record<string, number>;
  requires: string[];
  enabled: boolean;
  params: Record<string, number>;
}

export interface RecycleBinEntry {
  id: number;
  recommendationId: number;
  title: string;
  files: { originalPath: string; binPath: string }[];
  sizeBytes: number;
  status: 'binned' | 'restored' | 'purged';
  movedAt: string;
  purgeAfter: string;
}

export interface ActivityEntry {
  id: number;
  type: string;
  message: string;
  details: Record<string, unknown> | null;
  bytesFreed: number;
  dryRun: boolean;
  createdAt: string;
}

export interface ProtectedItem {
  id: number;
  sourceId: number;
  providerItemId: string;
  title: string;
}

export interface GeneralSettings {
  dryRun: boolean;
  recycleBinDir: string;
  retentionDays: number;
  scanCron: string | null;
}

export interface PathMapping {
  from: string;
  to: string;
}

export interface ArrSettings {
  enabled: boolean;
  baseUrl: string;
  apiKey: string;
}

export interface MaintenanceSettings {
  appdataPaths: Record<string, string>;
}

export interface SecuritySettings {
  apiKey: string | null;
}

export interface AiSettings {
  enabled: boolean;
  baseUrl: string;
  model: string;
}

export interface MaintenanceOperation {
  key: string;
  name: string;
  description: string;
  filesystem: boolean;
  available: boolean;
  unavailableReason?: string;
}

export interface LibraryStat {
  libraryName: string;
  itemCount: number;
  sizeBytes: number;
}

export interface SetupStatus {
  sources: number;
  completedScans: number;
  pathMappings: number;
  radarrConfigured: boolean;
  sonarrConfigured: boolean;
  radarrEnabled: boolean;
  sonarrEnabled: boolean;
  dryRun: boolean;
  scanCron: string | null;
  aiEnabled: boolean;
}

export interface Dashboard {
  lastScan: Scan | null;
  openRecommendations: number;
  reclaimableBytes: number;
  spaceSavedBytes: number;
  libraries: LibraryStat[];
}

// ── Custom rules (structured condition builder) ──────────────────────────────

export interface CustomRuleCondition {
  field: string;
  operator: string;
  value: number | string;
}

export interface CustomRule {
  id?: number;
  name: string;
  description?: string;
  appliesTo: 'movie' | 'show' | 'both';
  match: 'all' | 'any';
  conditions: CustomRuleCondition[];
  points: number;
  enabled: boolean;
}

export interface CustomRuleField {
  key: string;
  label: string;
  type: 'number' | 'string' | 'enum' | 'labels';
  appliesTo: 'movie' | 'show' | 'both';
  requires?: string;
  enumValues?: string[];
  description: string;
}

export interface CustomRuleFieldsResponse {
  fields: CustomRuleField[];
  operators: Record<string, { key: string; label: string }[]>;
}

export interface CustomRulePreview {
  matchCount: number;
  totalSizeBytes: number;
  itemCount: number;
  sample: { title: string; year: number | null; libraryName: string; sizeBytes: number; reason: string }[];
}
