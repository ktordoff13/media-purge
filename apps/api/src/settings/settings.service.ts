import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppSetting } from '../database/entities/app-setting.entity';
import { PathMapping, SETTINGS_DEFAULTS, SettingsKey } from './settings.types';

@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(AppSetting)
    private readonly repo: Repository<AppSetting>,
  ) {}

  async get<K extends SettingsKey>(key: K): Promise<(typeof SETTINGS_DEFAULTS)[K]> {
    const row = await this.repo.findOneBy({ key });
    const defaults = SETTINGS_DEFAULTS[key];
    if (row == null) return defaults;
    // Merge so newly introduced fields pick up defaults for older configs.
    if (Array.isArray(defaults)) return row.value as (typeof SETTINGS_DEFAULTS)[K];
    return { ...defaults, ...(row.value as object) } as (typeof SETTINGS_DEFAULTS)[K];
  }

  async set<K extends SettingsKey>(key: K, value: (typeof SETTINGS_DEFAULTS)[K]): Promise<void> {
    await this.repo.save({ key, value });
  }

  /** Longest-prefix path translation from media-server paths to local paths. */
  translatePath(serverPath: string, mappings: PathMapping[]): string {
    let best: PathMapping | null = null;
    for (const m of mappings) {
      if (!m.from || !serverPath.startsWith(m.from)) continue;
      if (!best || m.from.length > best.from.length) best = m;
    }
    return best ? best.to + serverPath.slice(best.from.length) : serverPath;
  }
}
