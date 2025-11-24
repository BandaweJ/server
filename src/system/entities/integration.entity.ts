/* eslint-disable prettier/prettier */
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum IntegrationType {
  PAYMENT_GATEWAY = 'PAYMENT_GATEWAY',
  SMS_SERVICE = 'SMS_SERVICE',
  CLOUD_STORAGE = 'CLOUD_STORAGE',
  ACCOUNTING_SOFTWARE = 'ACCOUNTING_SOFTWARE',
  PARENT_COMMUNICATION = 'PARENT_COMMUNICATION',
  LEARNING_MANAGEMENT = 'LEARNING_MANAGEMENT',
  OTHER = 'OTHER',
}

export enum IntegrationStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  ERROR = 'ERROR',
  PENDING = 'PENDING',
}

@Entity('integrations')
export class IntegrationEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'enum',
    enum: IntegrationType,
    nullable: false,
  })
  type: IntegrationType;

  @Column({ nullable: false })
  name: string; // e.g., "Stripe", "Twilio", "AWS S3"

  @Column({ nullable: true })
  description: string;

  @Column({
    type: 'enum',
    enum: IntegrationStatus,
    default: IntegrationStatus.INACTIVE,
  })
  status: IntegrationStatus;

  // Configuration stored as JSON
  @Column({ type: 'json', nullable: true })
  configuration: {
    apiKey?: string;
    apiSecret?: string;
    baseUrl?: string;
    webhookUrl?: string;
    [key: string]: any; // Allow flexible configuration
  };

  // Test/Sandbox mode
  @Column({ default: false })
  isTestMode: boolean;

  // Last sync/check time
  @Column({ type: 'timestamp', nullable: true })
  lastSyncAt: Date;

  // Error tracking
  @Column({ type: 'text', nullable: true })
  lastError: string;

  @Column({ type: 'timestamp', nullable: true })
  lastErrorAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

