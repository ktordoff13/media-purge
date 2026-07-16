export interface GeneralSettings {
  /** When true (the out-of-the-box default) no file is ever touched. */
  dryRun: boolean;
  recycleBinDir: string;
  retentionDays: number;
  /** Cron expression for scheduled scans, or null to disable. */
  scanCron: string | null;
}

/**
 * Translates media-server file paths into this container's namespace.
 * Example: Plex sees /data/movies, this container mounts it at /media/movies.
 */
export interface PathMapping {
  from: string;
  to: string;
}

export interface ArrSettings {
  enabled: boolean;
  baseUrl: string;
  apiKey: string;
  /** Delete the entry from the *arr on approval instead of just unmonitoring it. */
  removeOnApproval: boolean;
}

export interface MaintenanceSettings {
  /** sourceId → appdata dir mounted into this container (enables fs cleanups). */
  appdataPaths: Record<string, string>;
}

export interface SecuritySettings {
  /** When set, all API calls must send this in the X-Api-Key header. */
  apiKey: string | null;
}

/**
 * Optional local AI advisor (Ollama/LM Studio/llama.cpp — anything speaking
 * the OpenAI-compatible chat API). Purely for fun "you might regret deleting
 * this" notes on recommendations; never affects scoring or deletions and the
 * app is fully functional with it disabled.
 */
export interface AiSettings {
  enabled: boolean;
  /** e.g. http://localhost:11434 (Ollama) — /v1 is appended automatically. */
  baseUrl: string;
  /** Model name as the server knows it, e.g. 'llama3.1' or 'qwen3'. */
  model: string;
}

export interface AllSettings {
  general: GeneralSettings;
  pathMappings: PathMapping[];
  radarr: ArrSettings;
  sonarr: ArrSettings;
  maintenance: MaintenanceSettings;
  security: SecuritySettings;
  ai: AiSettings;
}

export const SETTINGS_DEFAULTS: AllSettings = {
  general: {
    dryRun: true,
    recycleBinDir: process.env.RECYCLE_BIN_DIR ?? '/recycle-bin',
    retentionDays: 30,
    scanCron: null,
  },
  pathMappings: [],
  radarr: { enabled: false, baseUrl: '', apiKey: '', removeOnApproval: false },
  sonarr: { enabled: false, baseUrl: '', apiKey: '', removeOnApproval: false },
  maintenance: { appdataPaths: {} },
  security: { apiKey: null },
  ai: {
    enabled: false,
    baseUrl: 'http://localhost:11434',
    model: 'llama3.1',
  },
};

export type SettingsKey = keyof typeof SETTINGS_DEFAULTS;
