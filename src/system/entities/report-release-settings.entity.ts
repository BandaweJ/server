import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { AccountsEntity } from '../../auth/entities/accounts.entity';

@Entity('report_release_settings')
export class ReportReleaseSettings {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'int' })
  termNumber: number;

  @Column({ type: 'int' })
  termYear: number;

  @Column({ type: 'enum', enum: ['Mid Term', 'End Of Term'] })
  examType: 'Mid Term' | 'End Of Term';

  @Column({ type: 'boolean', default: false })
  isReleased: boolean;

  @Column({ type: 'timestamp', nullable: true })
  releaseDate: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  scheduledReleaseDate: Date | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  releasedBy: string | null;

  @ManyToOne(() => AccountsEntity, { nullable: true })
  @JoinColumn({ name: 'releasedByUserId' })
  releasedByUser: AccountsEntity | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  releaseNotes: string | null;

  @Column({ type: 'boolean', default: true })
  sendNotification: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Helper method to check if reports should be available
  isAvailable(): boolean {
    if (this.isReleased) {
      return true;
    }

    // Check if scheduled release date has passed
    if (this.scheduledReleaseDate && new Date() >= this.scheduledReleaseDate) {
      return true;
    }

    return false;
  }
}
