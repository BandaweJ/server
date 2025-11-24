/* eslint-disable prettier/prettier */
import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { Transporter } from 'nodemailer';
import { SystemSettingsService } from '../../system/services/system-settings.service';

export interface EmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  attachments?: Array<{
    filename: string;
    path?: string;
    content?: Buffer | string;
    contentType?: string;
  }>;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: Transporter | null = null;
  private settingsLoaded = false;

  constructor(private readonly systemSettingsService: SystemSettingsService) {}

  /**
   * Initialize email transporter with settings from database
   */
  private async initializeTransporter(): Promise<Transporter | null> {
    if (this.transporter && this.settingsLoaded) {
      return this.transporter;
    }

    try {
      const settings = await this.systemSettingsService.getSettings();

      // Check if email notifications are enabled
      if (!settings.emailNotificationsEnabled) {
        this.logger.debug('Email notifications are disabled in system settings');
        return null;
      }

      // Check if SMTP is configured
      if (!settings.smtpHost || !settings.smtpUser || !settings.smtpFromEmail) {
        this.logger.warn('SMTP settings are not fully configured');
        return null;
      }

      // Create transporter
      this.transporter = nodemailer.createTransport({
        host: settings.smtpHost,
        port: settings.smtpPort || 587,
        secure: settings.smtpSecure || false, // true for 465, false for other ports
        auth: {
          user: settings.smtpUser,
          pass: settings.smtpPassword || '',
        },
      });

      // Verify connection
      await this.transporter.verify();
      this.settingsLoaded = true;
      this.logger.log('Email transporter initialized successfully');

      return this.transporter;
    } catch (error) {
      this.logger.error('Failed to initialize email transporter:', error);
      this.transporter = null;
      this.settingsLoaded = false;
      return null;
    }
  }

  /**
   * Send email
   */
  async sendEmail(options: EmailOptions): Promise<boolean> {
    try {
      const transporter = await this.initializeTransporter();
      if (!transporter) {
        this.logger.warn('Email transporter not available, skipping email send');
        return false;
      }

      const settings = await this.systemSettingsService.getSettings();

      const mailOptions = {
        from: `"${settings.smtpFromName || settings.schoolName || 'School Management System'}" <${settings.smtpFromEmail}>`,
        to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
        subject: options.subject,
        html: options.html,
        text: options.text || this.stripHtml(options.html),
        attachments: options.attachments || [],
      };

      const info = await transporter.sendMail(mailOptions);
      this.logger.log(`Email sent successfully: ${info.messageId}`);
      return true;
    } catch (error) {
      this.logger.error('Failed to send email:', error);
      return false;
    }
  }

  /**
   * Strip HTML tags from text for plain text version
   */
  private stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
  }

  /**
   * Send email to multiple recipients
   */
  async sendBulkEmail(
    recipients: string[],
    subject: string,
    html: string,
    text?: string,
  ): Promise<{ success: number; failed: number }> {
    let success = 0;
    let failed = 0;

    for (const recipient of recipients) {
      const sent = await this.sendEmail({
        to: recipient,
        subject,
        html,
        text,
      });
      if (sent) {
        success++;
      } else {
        failed++;
      }
    }

    return { success, failed };
  }
}

