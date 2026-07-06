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
}

export interface MaintenanceSettings {
  /** sourceId → appdata dir mounted into this container (enables fs cleanups). */
  appdataPaths: Record<string, string>;
}

export interface SecuritySettings {
  /** When set, all API calls must send this in the X-Api-Key header. */
  apiKey: string | null;
}

export const SETTINGS_DEFAULTS = {
  general: {
    dryRun: true,
    recycleBinDir: process.env.RECYCLE_BIN_DIR ?? '/recycle-bin',
    retentionDays: 30,
    scanCron: null,
  } as GeneralSettings,
  pathMappings: [] as PathMapping[],
  radarr: { enabled: false, baseUrl: '', apiKey: '' } as ArrSettings,
  sonarr: { enabled: false, baseUrl: '', apiKey: '' } as ArrSettings,
  maintenance: { appdataPaths: {} } as MaintenanceSettings,
  security: { apiKey: null } as SecuritySettings,
};

export type SettingsKey = keyof typeof SETTINGS_DEFAULTS;
