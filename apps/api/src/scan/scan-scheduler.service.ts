import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression, SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { SettingsService } from '../settings/settings.service';
import { ScanService } from './scan.service';

const JOB_NAME = 'scheduled-scan';

/**
 * Registers the user-configured scan cron. Settings are re-read every few
 * minutes so schedule changes apply without a restart.
 */
@Injectable()
export class ScanSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(ScanSchedulerService.name);
  private currentExpression: string | null = null;

  constructor(
    private readonly registry: SchedulerRegistry,
    private readonly settings: SettingsService,
    private readonly scan: ScanService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.refresh();
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async refresh(): Promise<void> {
    const { scanCron } = await this.settings.get('general');
    if (scanCron === this.currentExpression) return;

    if (this.registry.doesExist('cron', JOB_NAME)) {
      this.registry.deleteCronJob(JOB_NAME);
    }
    this.currentExpression = scanCron;
    if (!scanCron) {
      this.logger.log('Scheduled scans disabled');
      return;
    }
    try {
      const job = new CronJob(scanCron, () => {
        this.scan.start().catch((err: Error) => {
          this.logger.warn(`Scheduled scan skipped: ${err.message}`);
        });
      });
      this.registry.addCronJob(JOB_NAME, job);
      job.start();
      this.logger.log(`Scheduled scans enabled: ${scanCron}`);
    } catch (err) {
      this.logger.error(
        `Invalid scan cron '${scanCron}': ${(err as Error).message}`,
      );
      this.currentExpression = null;
    }
  }
}
