import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ReportReleaseSettings } from '../entities/report-release-settings.entity';
import { AccountsEntity } from '../../auth/entities/accounts.entity';
import { NotificationService } from '../../notifications/services/notification.service';

@Injectable()
export class ReportReleaseNotificationService {
  private readonly logger = new Logger(ReportReleaseNotificationService.name);

  constructor(
    @InjectRepository(ReportReleaseSettings)
    private reportReleaseRepository: Repository<ReportReleaseSettings>,
    private notificationService: NotificationService,
  ) {}

  async sendReleaseNotification(
    reportRelease: ReportReleaseSettings,
  ): Promise<void> {
    try {
      this.logger.log(
        `Sending release notification for ${reportRelease.examType} Term ${reportRelease.termNumber} ${reportRelease.termYear}`,
      );

      // Create notification message
      const message = `Reports for ${reportRelease.examType} Term ${reportRelease.termNumber} ${reportRelease.termYear} have been released.`;

      // Get all students who should receive this notification
      const studentNotifications = await this.getStudentNotifications(
        reportRelease,
      );

      // Send notifications to all relevant students
      for (const notification of studentNotifications) {
        await this.notificationService.sendReportCardNotification({
          studentName: notification.studentName,
          studentNumber: notification.userId,
          className: 'Various Classes', // This would come from enrolment data
          termNumber: reportRelease.termNumber,
          termYear: reportRelease.termYear,
          examType: reportRelease.examType,
          parentEmail: notification.studentEmail, // This would come from student/parent relationship
        });
      }

      // Send notification to parents if enabled
      if (reportRelease.sendNotification) {
        const parentNotifications = await this.getParentNotifications(
          reportRelease,
        );

        for (const notification of parentNotifications) {
          await this.notificationService.sendReportCardNotification({
            studentName: notification.studentName,
            studentNumber: notification.userId,
            className: 'Various Classes',
            termNumber: reportRelease.termNumber,
            termYear: reportRelease.termYear,
            examType: reportRelease.examType,
            parentEmail: notification.studentEmail,
          });
        }

        this.logger.log(
          `Successfully sent ${
            studentNotifications.length + parentNotifications.length
          } notifications for report release`,
        );
      } else {
        this.logger.log(
          `Successfully sent ${studentNotifications.length} notifications for report release`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to send release notifications: ${error.message}`,
        error,
      );
      throw error;
    }
  }

  private async getStudentNotifications(
    reportRelease: ReportReleaseSettings,
  ): Promise<
    Array<{ userId: string; studentName: string; studentEmail?: string }>
  > {
    // This would typically query your enrolment/students tables
    // For now, return a placeholder implementation
    // In a real implementation, you would:
    // 1. Query enrolments for the specific term/year
    // 2. Get all students in those enrolments
    // 3. Return array of { userId: student.id, studentName: student.name }

    // Placeholder implementation - replace with actual database queries
    return [
      {
        userId: 'student1',
        studentName: 'John Doe',
        studentEmail: 'john.doe@school.com',
      },
      {
        userId: 'student2',
        studentName: 'Jane Smith',
        studentEmail: 'jane.smith@school.com',
      },
      // ... more students
    ];
  }

  private async getParentNotifications(
    reportRelease: ReportReleaseSettings,
  ): Promise<
    Array<{ userId: string; studentName: string; studentEmail?: string }>
  > {
    // This would typically query your enrolment/students/parents relationships
    // For now, return a placeholder implementation
    // In a real implementation, you would:
    // 1. Get students from the term/year
    // 2. For each student, get their associated parents
    // 3. Return array of { userId: parent.id, studentName: student.name }

    // Placeholder implementation - replace with actual database queries
    return [
      {
        userId: 'parent1',
        studentName: 'John Doe',
        studentEmail: 'parent1@school.com',
      },
      {
        userId: 'parent2',
        studentName: 'Jane Smith',
        studentEmail: 'parent2@school.com',
      },
      // ... more parents
    ];
  }
}
