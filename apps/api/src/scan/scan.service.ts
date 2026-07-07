import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Scan } from '../database/entities/scan.entity';
import { MediaItem } from '../database/entities/media-item.entity';
import { MediaSource } from '../database/entities/media-source.entity';
import { ProtectedItem } from '../database/entities/protected-item.entity';
import { Recommendation } from '../database/entities/recommendation.entity';
import { ProviderRegistry } from '../providers/provider-registry.service';
import { RemoteMediaItem } from '../providers/media-server-provider.interface';
import { RulesService, KEEP_LABEL, MIN_RECOMMENDATION_SCORE } from '../rules/rules.service';
import { ActivityService } from '../activity/activity.service';
import { AiAdvisorService } from '../ai/ai-advisor.service';
import { gb } from '../rules/rule.interface';

@Injectable()
export class ScanService {
  private readonly logger = new Logger(ScanService.name);
  private running = false;

  constructor(
    @InjectRepository(Scan) private readonly scans: Repository<Scan>,
    @InjectRepository(MediaItem) private readonly items: Repository<MediaItem>,
    @InjectRepository(MediaSource) private readonly sources: Repository<MediaSource>,
    @InjectRepository(Recommendation) private readonly recommendations: Repository<Recommendation>,
    @InjectRepository(ProtectedItem) private readonly protectedItems: Repository<ProtectedItem>,
    private readonly registry: ProviderRegistry,
    private readonly rules: RulesService,
    private readonly activity: ActivityService,
    private readonly aiAdvisor: AiAdvisorService,
  ) {}

  get isRunning(): boolean {
    return this.running;
  }

  /** Kick off a scan in the background; returns the scan row immediately. */
  async start(): Promise<Scan> {
    if (this.running) throw new ConflictException('A scan is already running');
    const enabledSources = await this.sources.findBy({ enabled: true });
    if (enabledSources.length === 0) {
      throw new ConflictException('No enabled media sources configured');
    }
    this.running = true;
    const scan = await this.scans.save(this.scans.create({}));
    await this.activity.log('scan.started', `Scan #${scan.id} started`);
    void this.run(scan, enabledSources)
      .catch(async (err: Error) => {
        this.logger.error(`Scan #${scan.id} failed: ${err.message}`, err.stack);
        await this.scans.update(scan.id, {
          status: 'failed',
          error: err.message,
          finishedAt: new Date(),
        });
        await this.activity.log('scan.failed', `Scan #${scan.id} failed: ${err.message}`);
      })
      .finally(() => (this.running = false));
    return scan;
  }

  private async run(scan: Scan, enabledSources: MediaSource[]): Promise<void> {
    let itemCount = 0;
    let totalSizeBytes = 0;

    for (const source of enabledSources) {
      const provider = this.registry.get(source.type);
      const libraries = (await provider.listLibraries(source)).filter(
        (lib) => !source.excludedLibraryIds.includes(lib.id),
      );
      for (const library of libraries) {
        const remote = await provider.fetchItems(source, library);
        const rows = remote.map((r) => this.toEntity(r, scan.id, source.id));
        for (let i = 0; i < rows.length; i += 200) {
          await this.items.save(rows.slice(i, i + 200));
        }
        itemCount += rows.length;
        totalSizeBytes += rows.reduce((sum, r) => sum + Number(r.sizeBytes), 0);
        this.logger.log(
          `Scan #${scan.id}: ${source.name}/${library.name} → ${rows.length} items`,
        );
      }
    }

    const { count, bytes } = await this.generateRecommendations(scan);

    await this.scans.update(scan.id, {
      status: 'completed',
      itemCount,
      totalSizeBytes,
      recommendationCount: count,
      reclaimableBytes: bytes,
      finishedAt: new Date(),
    });
    await this.aiAdvisor.adviseAfterScan(scan.id);
    await this.activity.log(
      'scan.completed',
      `Scan #${scan.id} finished: ${itemCount} items, ${count} recommendations, ${gb(bytes)} reclaimable`,
      { scanId: scan.id, itemCount, recommendationCount: count, reclaimableBytes: bytes },
    );
  }

  private async generateRecommendations(scan: Scan): Promise<{ count: number; bytes: number }> {
    const configs = new Map((await this.rules.getConfigs()).map((c) => [c.key, c]));
    const customRules = await this.rules.getEnabledCustomRules();
    const protectedSet = new Set(
      (await this.protectedItems.find()).map((p) => `${p.sourceId}:${p.providerItemId}`),
    );
    // Respect earlier dismissals: an item the user rejected stays rejected
    // until they clear the dismissal or the item's stats change materially.
    const dismissed = new Set(
      (
        await this.recommendations
          .createQueryBuilder('r')
          .innerJoin('r.mediaItem', 'mi')
          .select(["mi.sourceId || ':' || mi.providerItemId AS key"])
          .where("r.status = 'dismissed'")
          .getRawMany<{ key: string }>()
      ).map((row) => row.key),
    );

    const items = await this.items.findBy({ scanId: scan.id });
    const sourceRows = await this.sources.findBy({ id: In([...new Set(items.map((i) => i.sourceId))]) });
    const capsBySource = new Map(
      sourceRows.map((s) => [s.id, this.registry.get(s.type).capabilities]),
    );

    let count = 0;
    let bytes = 0;
    const now = new Date();
    const toSave: Recommendation[] = [];
    for (const item of items) {
      const key = `${item.sourceId}:${item.providerItemId}`;
      if (protectedSet.has(key) || dismissed.has(key)) continue;
      if (item.labels.some((l) => l.toLowerCase() === KEEP_LABEL)) continue;
      const caps = capsBySource.get(item.sourceId);
      if (!caps) continue;
      const reasons = this.rules.evaluateItem(item, caps, configs, customRules, now);
      const totalScore = reasons.reduce((sum, r) => sum + r.points, 0);
      if (totalScore < MIN_RECOMMENDATION_SCORE) continue;
      toSave.push(
        this.recommendations.create({
          scanId: scan.id,
          mediaItemId: item.id,
          totalScore,
          reasons,
          sizeBytes: item.sizeBytes,
        }),
      );
      count += 1;
      bytes += Number(item.sizeBytes);
    }
    for (let i = 0; i < toSave.length; i += 200) {
      await this.recommendations.save(toSave.slice(i, i + 200));
    }
    if (count > 0) {
      await this.activity.log(
        'recommendation.created',
        `Scan #${scan.id} produced ${count} cleanup recommendations (${gb(bytes)})`,
        { scanId: scan.id, count, bytes },
      );
    }
    return { count, bytes };
  }

  private toEntity(r: RemoteMediaItem, scanId: number, sourceId: number): MediaItem {
    return this.items.create({
      scanId,
      sourceId,
      providerItemId: r.providerItemId,
      libraryId: r.libraryId,
      libraryName: r.libraryName,
      type: r.type,
      title: r.title,
      year: r.year,
      addedAt: r.addedAt,
      lastPlayedAt: r.lastPlayedAt,
      playCount: r.playCount,
      watchProgress: r.watchProgress,
      ratingCritic: r.ratingCritic,
      ratingAudience: r.ratingAudience,
      filePaths: r.filePaths,
      sizeBytes: r.sizeBytes,
      resolution: r.resolution,
      versionCount: r.versionCount,
      externalIds: r.externalIds,
      labels: r.labels,
      seriesStatus: r.seriesStatus,
      episodeCount: r.episodeCount,
      watchedEpisodeCount: r.watchedEpisodeCount,
      lastEpisodeAddedAt: r.lastEpisodeAddedAt,
      thumbPath: r.thumbPath,
      providerData: r.providerData,
    });
  }

  async list(limit = 20): Promise<Scan[]> {
    return this.scans.find({ order: { id: 'DESC' }, take: limit });
  }

  async latest(): Promise<Scan | null> {
    return this.scans.findOne({ where: {}, order: { id: 'DESC' } });
  }
}
