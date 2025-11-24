/* eslint-disable prettier/prettier */
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SystemSettingsEntity } from '../entities/system-settings.entity';

export interface SystemSettingsDto {
  // School Information
  schoolName?: string;
  schoolAddress?: string;
  schoolPhone?: string;
  schoolEmail?: string;
  schoolWebsite?: string;
  schoolLogo?: string;

  // School Branding Colors
  primaryColor?: string;
  accentColor?: string;
  warnColor?: string;

  // Email/SMTP Settings
  smtpHost?: string;
  smtpPort?: number;
  smtpSecure?: boolean;
  smtpUser?: string;
  smtpPassword?: string;
  smtpFromEmail?: string;
  smtpFromName?: string;

  // Notification Settings
  emailNotificationsEnabled?: boolean;
  smsNotificationsEnabled?: boolean;

  // Session Settings
  sessionTimeoutMinutes?: number;
  requirePasswordChange?: boolean;
  passwordExpiryDays?: number;

  // General Settings
  defaultLanguage?: string;
  timezone?: string;
  currency?: string;
  dateFormat?: string;

  // Security Settings
  maxLoginAttempts?: number;
  lockoutDurationMinutes?: number;
  enableTwoFactorAuth?: boolean;

  // Backup Settings
  autoBackupEnabled?: boolean;
  backupRetentionDays?: number;
  backupSchedule?: string;
}

@Injectable()
export class SystemSettingsService {
  private readonly logger = new Logger(SystemSettingsService.name);

  constructor(
    @InjectRepository(SystemSettingsEntity)
    private settingsRepository: Repository<SystemSettingsEntity>,
  ) {}

  /**
   * Get system settings (creates default if none exist)
   */
  async getSettings(): Promise<SystemSettingsEntity> {
    let settings = await this.settingsRepository.findOne({
      where: {},
      order: { createdAt: 'DESC' },
    });

    if (!settings) {
      this.logger.log('No system settings found, creating default settings');
      settings = await this.createDefaultSettings();
    }

    return settings;
  }

  /**
   * Update system settings
   */
  async updateSettings(
    updateDto: SystemSettingsDto,
  ): Promise<SystemSettingsEntity> {
    let settings = await this.settingsRepository.findOne({
      where: {},
      order: { createdAt: 'DESC' },
    });

    if (!settings) {
      settings = await this.createDefaultSettings();
    }

    // Update only provided fields
    Object.keys(updateDto).forEach((key) => {
      if (updateDto[key] !== undefined) {
        settings[key] = updateDto[key];
      }
    });

    return await this.settingsRepository.save(settings);
  }

  /**
   * Create default system settings
   */
  private async createDefaultSettings(): Promise<SystemSettingsEntity> {
    const defaultSettings = this.settingsRepository.create({
      schoolName: 'Junior High School',
      schoolAddress: '',
      schoolPhone: '',
      schoolEmail: '',
      schoolWebsite: '',
      schoolLogo: 'assets/jhs_logo.jpg',
      // Branding colors matching current theme
      primaryColor: '#2196f3', // Blue
      accentColor: '#ffc107', // Gold
      warnColor: '#795548', // Brown
      // Session settings
      sessionTimeoutMinutes: 30,
      requirePasswordChange: false,
      passwordExpiryDays: 90,
      // General settings
      defaultLanguage: 'en',
      timezone: 'Africa/Harare',
      currency: 'USD',
      dateFormat: 'dd/MM/yyyy',
      // Security settings
      maxLoginAttempts: 5,
      lockoutDurationMinutes: 15,
      enableTwoFactorAuth: false,
      // Notification settings
      emailNotificationsEnabled: true,
      smsNotificationsEnabled: false,
      // SMTP settings
      smtpHost: '',
      smtpPort: 587,
      smtpSecure: false,
      smtpUser: '',
      smtpPassword: '',
      smtpFromEmail: '',
      smtpFromName: '',
      // Backup settings
      autoBackupEnabled: true,
      backupRetentionDays: 7,
      backupSchedule: '',
    });

    return await this.settingsRepository.save(defaultSettings);
  }

  /**
   * Reset settings to defaults
   */
  async resetToDefaults(): Promise<SystemSettingsEntity> {
    const existing = await this.settingsRepository.findOne({
      where: {},
      order: { createdAt: 'DESC' },
    });

    if (existing) {
      await this.settingsRepository.remove(existing);
    }

    return await this.createDefaultSettings();
  }
}

