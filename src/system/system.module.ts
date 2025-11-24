/* eslint-disable prettier/prettier */
import { Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GradingSystemEntity } from './entities/grading-system.entity';
import { SystemSettingsEntity } from './entities/system-settings.entity';
import { GradingSystemService } from './services/grading-system.service';
import { SystemSettingsService } from './services/system-settings.service';
import { GradingSystemController } from './controllers/grading-system.controller';
import { SystemSettingsController } from './controllers/system-settings.controller';
import { Logger, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PaymentModule } from '../payment/payment.module';
import { AuditLogsController } from './controllers/audit-logs.controller';
import { AnalyticsController } from './controllers/analytics.controller';
import { AnalyticsService } from './services/analytics.service';
import { StudentsEntity } from '../profiles/entities/students.entity';
import { EnrolEntity } from '../enrolment/entities/enrol.entity';
import { InvoiceEntity } from '../payment/entities/invoice.entity';
import { ReceiptEntity } from '../payment/entities/payment.entity';
import { ReportsEntity } from '../reports/entities/report.entity';
import { AccountsEntity } from '../auth/entities/accounts.entity';
import { TeachersEntity } from '../profiles/entities/teachers.entity';
import { ParentsEntity } from '../profiles/entities/parents.entity';
import { FinancialAuditLogEntity } from '../payment/entities/financial-audit-log.entity';
import { EnrolmentModule } from '../enrolment/enrolment.module';
import { IntegrationEntity } from './entities/integration.entity';
import { IntegrationService } from './services/integration.service';
import { IntegrationController } from './controllers/integration.controller';
import { CalendarEventEntity } from './entities/calendar-event.entity';
import { EventNotificationEntity } from './entities/event-notification.entity';
import { CalendarService } from './services/calendar.service';
import { CalendarController } from './controllers/calendar.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      GradingSystemEntity,
      SystemSettingsEntity,
      StudentsEntity,
      EnrolEntity,
      InvoiceEntity,
      ReceiptEntity,
      ReportsEntity,
      AccountsEntity,
      TeachersEntity,
      ParentsEntity,
      FinancialAuditLogEntity,
      IntegrationEntity,
      CalendarEventEntity,
      EventNotificationEntity,
    ]),
    AuthModule, // Import AuthModule to provide RolesGuard and AccountsEntityRepository
    forwardRef(() => PaymentModule), // Import PaymentModule to access AuditService (forwardRef to break circular dependency)
    EnrolmentModule, // Import EnrolmentModule to access EnrolmentService for current term
  ],
  providers: [GradingSystemService, SystemSettingsService, AnalyticsService, IntegrationService, CalendarService],
  controllers: [
    GradingSystemController,
    SystemSettingsController,
    AuditLogsController,
    AnalyticsController,
    IntegrationController,
    CalendarController,
  ],
  exports: [GradingSystemService, SystemSettingsService, AnalyticsService, IntegrationService, CalendarService],
})
export class SystemModule implements OnModuleInit {
  private readonly logger = new Logger(SystemModule.name);

  constructor(
    private readonly gradingSystemService: GradingSystemService,
    private readonly systemSettingsService: SystemSettingsService,
  ) {}

  async onModuleInit() {
    // Initialize default grading systems and system settings on module startup
    // Use setTimeout to make it non-blocking and allow server to start first
    setTimeout(async () => {
      try {
        await this.gradingSystemService.initializeDefaultGradingSystems();
        this.logger.log('Default grading systems initialized');
      } catch (error) {
        this.logger.error('Failed to initialize default grading systems:', error);
        // Don't throw - allow the app to continue starting
      }

      try {
        // This will create default settings if none exist
        await this.systemSettingsService.getSettings();
        this.logger.log('System settings initialized');
      } catch (error) {
        this.logger.error('Failed to initialize system settings:', error);
        // Don't throw - allow the app to continue starting
      }
    }, 1000); // Wait 1 second after server starts
  }
}

