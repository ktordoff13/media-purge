import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * User-protected items ("never suggest deleting this").
 * Keyed by source + provider item id so protection survives across scans.
 */
@Entity('protected_item')
@Index(['sourceId', 'providerItemId'], { unique: true })
export class ProtectedItem {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  sourceId: number;

  @Column()
  providerItemId: string;

  @Column()
  title: string;

  @CreateDateColumn()
  createdAt: Date;
}
