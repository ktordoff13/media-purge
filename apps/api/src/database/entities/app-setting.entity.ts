import { Column, Entity, PrimaryColumn } from 'typeorm';

/** Key/value settings store; values are JSON blobs per settings section. */
@Entity('app_setting')
export class AppSetting {
  @PrimaryColumn()
  key: string;

  @Column({ type: 'simple-json' })
  value: unknown;
}
