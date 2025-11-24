/* eslint-disable prettier/prettier */
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('system_settings')
export class SystemSettingsEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // School Information
  @Column({ nullable: true })
  schoolName: string;

  @Column({ nullable: true })
  schoolAddress: string;

  @Column({ nullable: true })
  schoolPhone: string;

  @Column({ nullable: true })
  schoolEmail: string;

  @Column({ nullable: true })
  schoolWebsite: string;

  @Column({ nullable: true })
  schoolLogo: string; // URL or path to logo

  // School Branding Colors
  @Column({ nullable: true })
  primaryColor: string; // Primary brand color (e.g., #2196f3)

  @Column({ nullable: true })
  accentColor: string; // Accent color (e.g., #ffc107)

  @Column({ nullable: true })
  warnColor: string; // Warning/error color (e.g., #795548)

  // Email/SMTP Settings
  @Column({ nullable: true })
  smtpHost: string;

  @Column({ nullable: true })
  smtpPort: number;

  @Column({ default: false })
  smtpSecure: boolean; // Use TLS/SSL

  @Column({ nullable: true })
  smtpUser: string;

  @Column({ nullable: true })
  smtpPassword: string; // Should be encrypted

  @Column({ nullable: true })
  smtpFromEmail: string;

  @Column({ nullable: true })
  smtpFromName: string;

  // Notification Settings
  @Column({ default: true })
  emailNotificationsEnabled: boolean;

  @Column({ default: true })
  smsNotificationsEnabled: boolean;

  // Session Settings
  @Column({ default: 30 })
  sessionTimeoutMinutes: number; // Session timeout in minutes

  @Column({ default: true })
  requirePasswordChange: boolean;

  @Column({ default: 90 })
  passwordExpiryDays: number; // Password expires after X days

  // General Settings
  @Column({ default: 'en' })
  defaultLanguage: string;

  @Column({ default: 'Africa/Harare' })
  timezone: string;

  @Column({ default: 'USD' })
  currency: string;

  @Column({ default: 'dd/MM/yyyy' })
  dateFormat: string;

  // Security Settings
  @Column({ default: 5 })
  maxLoginAttempts: number;

  @Column({ default: 15 })
  lockoutDurationMinutes: number;

  @Column({ default: true })
  enableTwoFactorAuth: boolean;

  // Backup Settings
  @Column({ default: true })
  autoBackupEnabled: boolean;

  @Column({ default: 7 })
  backupRetentionDays: number;

  @Column({ nullable: true })
  backupSchedule: string; // Cron expression

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

