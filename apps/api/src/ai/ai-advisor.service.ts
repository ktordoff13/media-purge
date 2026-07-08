import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Recommendation } from '../database/entities/recommendation.entity';
import { SettingsService } from '../settings/settings.service';
import { ActivityService } from '../activity/activity.service';
import { ConnectionTestResult } from '../providers/media-server-provider.interface';
import { getJson, sendJson } from '../common/http.util';

interface ChatResponse {
  choices?: { message?: { content?: string } }[];
}

export interface Advisory {
  id: number;
  note: string;
}

const BATCH_SIZE = 40;
const NOTE_MAX_LEN = 200;

const SYSTEM_PROMPT =
  'You are a playful, knowledgeable film & TV buff reviewing a list of items a user is about ' +
  'to delete from their media server. Flag ONLY items a media lover might genuinely regret ' +
  'deleting: cult classics, award winners or critical darlings, beloved comfort rewatches, ' +
  'seasonal favorites, or pieces that complete a franchise/collection. For each flagged item ' +
  'write ONE short, fun, specific note (max 140 characters, light humor welcome, no spoilers). ' +
  'Flag at most a third of the list; if nothing stands out, return an empty array. ' +
  'Respond with STRICT JSON only — an array of objects: [{"id": <number>, "note": "<string>"}]. ' +
  'No prose, no markdown fences, no commentary.';

/**
 * Optional "you might regret this" advisor backed by a LOCAL OpenAI-compatible
 * server (Ollama, LM Studio, llama.cpp). Strictly cosmetic: notes are attached
 * to recommendations for display, never influence scores, and every failure
 * degrades to "no notes".
 */
@Injectable()
export class AiAdvisorService {
  private readonly logger = new Logger(AiAdvisorService.name);
  private running = false;

  constructor(
    @InjectRepository(Recommendation)
    private readonly recs: Repository<Recommendation>,
    private readonly settings: SettingsService,
    private readonly activity: ActivityService,
  ) {}

  async testConnection(): Promise<ConnectionTestResult> {
    const ai = await this.settings.get('ai');
    if (!ai.baseUrl)
      return { ok: false, message: 'No AI server URL configured' };
    try {
      const res = await getJson<{ data?: { id: string }[] }>(
        `${this.apiBase(ai.baseUrl)}/models`,
        {},
        10_000,
      );
      const models = (res.data ?? []).map((m) => m.id);
      const hasModel = models.some(
        (m) => m === ai.model || m.startsWith(`${ai.model}:`),
      );
      return {
        ok: true,
        message: hasModel
          ? `Connected — model '${ai.model}' is available`
          : `Connected, but model '${ai.model}' was not in the list (${models.slice(0, 5).join(', ') || 'none'})`,
        serverName: 'OpenAI-compatible server',
      };
    } catch (err) {
      return { ok: false, message: (err as Error).message };
    }
  }

  /** Kick off an advisory pass in the background for the given scan's open recs. */
  async advise(
    scanId?: number,
  ): Promise<{ started: boolean; message: string }> {
    const ai = await this.settings.get('ai');
    if (!ai.enabled) {
      throw new BadRequestException(
        'AI advisor is disabled — enable it in Settings → Integrations',
      );
    }
    if (this.running)
      return { started: false, message: 'An advisory pass is already running' };
    this.running = true;
    void this.run(scanId)
      .catch((err: Error) =>
        this.logger.warn(`AI advisory pass failed: ${err.message}`),
      )
      .finally(() => (this.running = false));
    return {
      started: true,
      message:
        'AI is reviewing your recommendations — notes appear as it finishes',
    };
  }

  /** Called after each scan; silently does nothing unless enabled. */
  async adviseAfterScan(scanId: number): Promise<void> {
    const ai = await this.settings.get('ai');
    if (!ai.enabled || this.running) return;
    this.running = true;
    void this.run(scanId)
      .catch((err: Error) =>
        this.logger.warn(`Post-scan AI advisory failed: ${err.message}`),
      )
      .finally(() => (this.running = false));
  }

  private async run(scanId?: number): Promise<void> {
    const ai = await this.settings.get('ai');
    const qb = this.recs
      .createQueryBuilder('r')
      .innerJoinAndSelect('r.mediaItem', 'item')
      .where("r.status = 'open'");
    if (scanId) qb.andWhere('r.scanId = :scanId', { scanId });
    else qb.andWhere('r.scanId = (SELECT MAX(scanId) FROM recommendation)');
    const open = await qb.getMany();
    if (open.length === 0) return;

    let flagged = 0;
    for (let i = 0; i < open.length; i += BATCH_SIZE) {
      const batch = open.slice(i, i + BATCH_SIZE);
      const advisories = await this.adviseBatch(ai.baseUrl, ai.model, batch);
      for (const advisory of advisories) {
        const rec = batch.find((r) => r.id === advisory.id);
        if (!rec) continue;
        await this.recs.update(rec.id, {
          aiNote: advisory.note.slice(0, NOTE_MAX_LEN),
        });
        flagged += 1;
      }
    }
    await this.activity.log(
      'ai.advised',
      `AI advisor reviewed ${open.length} recommendations and flagged ${flagged} you might regret deleting`,
      { model: ai.model, reviewed: open.length, flagged },
    );
  }

  private async adviseBatch(
    baseUrl: string,
    model: string,
    batch: Recommendation[],
  ): Promise<Advisory[]> {
    const items = batch.map((r) => ({
      id: r.id,
      title: r.mediaItem.title,
      year: r.mediaItem.year,
      type: r.mediaItem.type,
      library: r.mediaItem.libraryName,
      audienceRating: r.mediaItem.ratingAudience,
      criticRating: r.mediaItem.ratingCritic,
      playCount: r.mediaItem.playCount,
    }));
    const res = await sendJson<ChatResponse>(
      'POST',
      `${this.apiBase(baseUrl)}/chat/completions`,
      {
        model,
        stream: false,
        temperature: 0.7,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: JSON.stringify(items) },
        ],
      },
      {},
      180_000, // local models can be slow; one batch at a time
    );
    return parseAdvisories(res?.choices?.[0]?.message?.content ?? '');
  }

  /** Ollama serves the OpenAI API under /v1; accept URLs with or without it. */
  private apiBase(baseUrl: string): string {
    const trimmed = baseUrl.replace(/\/+$/, '');
    return trimmed.endsWith('/v1') ? trimmed : `${trimmed}/v1`;
  }
}

/**
 * Extract advisories from model output. Tolerates markdown fences and prose
 * around the JSON; anything unparseable yields no notes rather than an error.
 */
export function parseAdvisories(content: string): Advisory[] {
  const start = content.indexOf('[');
  const end = content.lastIndexOf(']');
  if (start === -1 || end <= start) return [];
  try {
    const parsed: unknown = JSON.parse(content.slice(start, end + 1));
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (a): a is Advisory =>
          typeof a === 'object' &&
          a !== null &&
          typeof (a as Advisory).id === 'number' &&
          typeof (a as Advisory).note === 'string' &&
          (a as Advisory).note.trim().length > 0,
      )
      .map((a) => ({ id: a.id, note: a.note.trim() }));
  } catch {
    return [];
  }
}
