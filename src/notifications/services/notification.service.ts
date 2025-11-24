/* eslint-disable prettier/prettier */
import { Injectable, Logger } from '@nestjs/common';
import { EmailService } from './email.service';
import { SystemSettingsService } from '../../system/services/system-settings.service';
import { StudentsEntity } from '../../profiles/entities/students.entity';
import { ParentsEntity } from '../../profiles/entities/parents.entity';
import { TeachersEntity } from '../../profiles/entities/teachers.entity';

export interface ReportCardNotificationData {
  studentName: string;
  studentNumber: string;
  className: string;
  termNumber: number;
  termYear: number;
  examType: string;
  parentEmail?: string;
  studentEmail?: string;
}

export interface InvoiceNotificationData {
  studentName: string;
  studentNumber: string;
  invoiceNumber: string;
  invoiceDate: Date;
  totalAmount: number;
  dueDate?: Date;
  parentEmail?: string;
  studentEmail?: string;
}

export interface PaymentNotificationData {
  studentName: string;
  studentNumber: string;
  receiptNumber: string;
  paymentDate: Date;
  amount: number;
  paymentMethod: string;
  parentEmail?: string;
  studentEmail?: string;
}

export interface LowBalanceNotificationData {
  studentName: string;
  studentNumber: string;
  currentBalance: number;
  parentEmail?: string;
  studentEmail?: string;
}

export interface ContinuousAssessmentNotificationData {
  studentName: string;
  studentNumber: string;
  topicOrSkill: string;
  assessmentDate: Date;
  score: number;
  maxScore?: number;
  assessmentType?: string;
  parentEmail?: string;
  studentEmail?: string;
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly emailService: EmailService,
    private readonly systemSettingsService: SystemSettingsService,
  ) {}

  /**
   * Send report card notification
   */
  async sendReportCardNotification(
    data: ReportCardNotificationData,
  ): Promise<boolean> {
    const settings = await this.systemSettingsService.getSettings();
    if (!settings.emailNotificationsEnabled) {
      return false;
    }

    const recipients: string[] = [];
    if (data.parentEmail) recipients.push(data.parentEmail);
    if (data.studentEmail) recipients.push(data.studentEmail);

    if (recipients.length === 0) {
      this.logger.warn(
        `No email addresses found for student ${data.studentNumber}`,
      );
      return false;
    }

    const subject = `Report Card Available - ${data.studentName} (Term ${data.termNumber}, ${data.termYear})`;
    const html = this.generateReportCardEmail(data, settings.schoolName);

    return await this.emailService.sendEmail({
      to: recipients,
      subject,
      html,
    });
  }

  /**
   * Send invoice notification
   */
  async sendInvoiceNotification(
    data: InvoiceNotificationData,
  ): Promise<boolean> {
    const settings = await this.systemSettingsService.getSettings();
    if (!settings.emailNotificationsEnabled) {
      return false;
    }

    const recipients: string[] = [];
    if (data.parentEmail) recipients.push(data.parentEmail);
    if (data.studentEmail) recipients.push(data.studentEmail);

    if (recipients.length === 0) {
      this.logger.warn(
        `No email addresses found for student ${data.studentNumber}`,
      );
      return false;
    }

    const subject = `New Invoice - ${data.studentName} (Invoice #${data.invoiceNumber})`;
    const html = this.generateInvoiceEmail(data, settings.schoolName);

    return await this.emailService.sendEmail({
      to: recipients,
      subject,
      html,
    });
  }

  /**
   * Send payment receipt notification
   */
  async sendPaymentNotification(
    data: PaymentNotificationData,
  ): Promise<boolean> {
    const settings = await this.systemSettingsService.getSettings();
    if (!settings.emailNotificationsEnabled) {
      return false;
    }

    const recipients: string[] = [];
    if (data.parentEmail) recipients.push(data.parentEmail);
    if (data.studentEmail) recipients.push(data.studentEmail);

    if (recipients.length === 0) {
      this.logger.warn(
        `No email addresses found for student ${data.studentNumber}`,
      );
      return false;
    }

    const subject = `Payment Receipt - ${data.studentName} (Receipt #${data.receiptNumber})`;
    const html = this.generatePaymentEmail(data, settings.schoolName);

    return await this.emailService.sendEmail({
      to: recipients,
      subject,
      html,
    });
  }

  /**
   * Send low balance alert
   */
  async sendLowBalanceAlert(
    data: LowBalanceNotificationData,
  ): Promise<boolean> {
    const settings = await this.systemSettingsService.getSettings();
    if (!settings.emailNotificationsEnabled) {
      return false;
    }

    const recipients: string[] = [];
    if (data.parentEmail) recipients.push(data.parentEmail);
    if (data.studentEmail) recipients.push(data.studentEmail);

    if (recipients.length === 0) {
      this.logger.warn(
        `No email addresses found for student ${data.studentNumber}`,
      );
      return false;
    }

    const subject = `Low Balance Alert - ${data.studentName}`;
    const html = this.generateLowBalanceEmail(data, settings.schoolName);

    return await this.emailService.sendEmail({
      to: recipients,
      subject,
      html,
    });
  }

  async sendContinuousAssessmentNotification(
    data: ContinuousAssessmentNotificationData,
  ): Promise<boolean> {
    const settings = await this.systemSettingsService.getSettings();
    if (!settings.emailNotificationsEnabled) {
      return false;
    }

    const recipients: string[] = [];
    if (data.parentEmail) recipients.push(data.parentEmail);
    if (data.studentEmail) recipients.push(data.studentEmail);

    if (recipients.length === 0) {
      return false;
    }

    const scoreText = data.maxScore ? `${data.score}/${data.maxScore}` : `${data.score}`;
    const subject = `Continuous Assessment Update - ${data.studentName}`;
    const html = `
      <h2>${settings.schoolName || 'School Notification'}</h2>
      <p>A new continuous assessment has been recorded.</p>
      <p><strong>Student:</strong> ${data.studentName} (${data.studentNumber})</p>
      <p><strong>Topic/Skill:</strong> ${data.topicOrSkill}</p>
      <p><strong>Assessment Type:</strong> ${data.assessmentType || 'Exercise'}</p>
      <p><strong>Date:</strong> ${new Date(data.assessmentDate).toLocaleDateString()}</p>
      <p><strong>Score:</strong> ${scoreText}</p>
      <p>Please log into the portal for more details.</p>
    `;

    return this.emailService.sendEmail({
      to: recipients,
      subject,
      html,
    });
  }

  /**
   * Generate report card email HTML
   */
  private generateReportCardEmail(
    data: ReportCardNotificationData,
    schoolName?: string,
  ): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #2196f3; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
          .content { background-color: #f9f9f9; padding: 20px; border-radius: 0 0 5px 5px; }
          .info-box { background-color: white; padding: 15px; margin: 15px 0; border-left: 4px solid #2196f3; }
          .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>${schoolName || 'School Management System'}</h1>
            <h2>Report Card Available</h2>
          </div>
          <div class="content">
            <p>Dear Parent/Guardian,</p>
            <p>We are pleased to inform you that the report card for <strong>${data.studentName}</strong> (Student #${data.studentNumber}) is now available.</p>
            
            <div class="info-box">
              <p><strong>Term:</strong> Term ${data.termNumber}, ${data.termYear}</p>
              <p><strong>Class:</strong> ${data.className}</p>
              <p><strong>Exam Type:</strong> ${data.examType}</p>
            </div>
            
            <p>You can view and download the report card by logging into the school management system.</p>
            <p>If you have any questions or concerns, please contact the school administration.</p>
            
            <p>Best regards,<br>${schoolName || 'School Management System'}</p>
          </div>
          <div class="footer">
            <p>This is an automated message. Please do not reply to this email.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Generate invoice email HTML
   */
  private generateInvoiceEmail(
    data: InvoiceNotificationData,
    schoolName?: string,
  ): string {
    const dueDateText = data.dueDate
      ? `<p><strong>Due Date:</strong> ${new Date(data.dueDate).toLocaleDateString()}</p>`
      : '';

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #2196f3; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
          .content { background-color: #f9f9f9; padding: 20px; border-radius: 0 0 5px 5px; }
          .info-box { background-color: white; padding: 15px; margin: 15px 0; border-left: 4px solid #2196f3; }
          .amount { font-size: 24px; font-weight: bold; color: #2196f3; }
          .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>${schoolName || 'School Management System'}</h1>
            <h2>New Invoice Generated</h2>
          </div>
          <div class="content">
            <p>Dear Parent/Guardian,</p>
            <p>A new invoice has been generated for <strong>${data.studentName}</strong> (Student #${data.studentNumber}).</p>
            
            <div class="info-box">
              <p><strong>Invoice Number:</strong> ${data.invoiceNumber}</p>
              <p><strong>Invoice Date:</strong> ${new Date(data.invoiceDate).toLocaleDateString()}</p>
              ${dueDateText}
              <p class="amount">Total Amount: ${data.totalAmount.toLocaleString()} ${this.getCurrencySymbol()}</p>
            </div>
            
            <p>Please log into the school management system to view the invoice details and make payment.</p>
            <p>If you have any questions, please contact the school administration.</p>
            
            <p>Best regards,<br>${schoolName || 'School Management System'}</p>
          </div>
          <div class="footer">
            <p>This is an automated message. Please do not reply to this email.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Generate payment receipt email HTML
   */
  private generatePaymentEmail(
    data: PaymentNotificationData,
    schoolName?: string,
  ): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #4caf50; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
          .content { background-color: #f9f9f9; padding: 20px; border-radius: 0 0 5px 5px; }
          .info-box { background-color: white; padding: 15px; margin: 15px 0; border-left: 4px solid #4caf50; }
          .amount { font-size: 24px; font-weight: bold; color: #4caf50; }
          .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>${schoolName || 'School Management System'}</h1>
            <h2>Payment Received</h2>
          </div>
          <div class="content">
            <p>Dear Parent/Guardian,</p>
            <p>We have received a payment for <strong>${data.studentName}</strong> (Student #${data.studentNumber}).</p>
            
            <div class="info-box">
              <p><strong>Receipt Number:</strong> ${data.receiptNumber}</p>
              <p><strong>Payment Date:</strong> ${new Date(data.paymentDate).toLocaleDateString()}</p>
              <p><strong>Payment Method:</strong> ${data.paymentMethod}</p>
              <p class="amount">Amount Paid: ${data.amount.toLocaleString()} ${this.getCurrencySymbol()}</p>
            </div>
            
            <p>Thank you for your payment. You can view the receipt details by logging into the school management system.</p>
            <p>If you have any questions, please contact the school administration.</p>
            
            <p>Best regards,<br>${schoolName || 'School Management System'}</p>
          </div>
          <div class="footer">
            <p>This is an automated message. Please do not reply to this email.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Generate low balance alert email HTML
   */
  private generateLowBalanceEmail(
    data: LowBalanceNotificationData,
    schoolName?: string,
  ): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #ff9800; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
          .content { background-color: #f9f9f9; padding: 20px; border-radius: 0 0 5px 5px; }
          .info-box { background-color: white; padding: 15px; margin: 15px 0; border-left: 4px solid #ff9800; }
          .amount { font-size: 24px; font-weight: bold; color: #ff9800; }
          .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>${schoolName || 'School Management System'}</h1>
            <h2>Low Balance Alert</h2>
          </div>
          <div class="content">
            <p>Dear Parent/Guardian,</p>
            <p>This is to inform you that the account balance for <strong>${data.studentName}</strong> (Student #${data.studentNumber}) is low.</p>
            
            <div class="info-box">
              <p class="amount">Current Balance: ${data.currentBalance.toLocaleString()} ${this.getCurrencySymbol()}</p>
            </div>
            
            <p>Please arrange to make a payment to avoid any inconvenience. You can view the account details and make payment by logging into the school management system.</p>
            <p>If you have any questions, please contact the school administration.</p>
            
            <p>Best regards,<br>${schoolName || 'School Management System'}</p>
          </div>
          <div class="footer">
            <p>This is an automated message. Please do not reply to this email.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Get currency symbol
   */
  private getCurrencySymbol(): string {
    // Default currency symbol - can be enhanced to read from settings
    return '$';
  }
}

