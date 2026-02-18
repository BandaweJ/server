/* eslint-disable prettier/prettier */
import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ProfilesModule } from './profiles/profiles.module';
import { AuthModule } from './auth/auth.module';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ResourceByIdModule } from './resource-by-id/resource-by-id.module';
import { EnrolmentModule } from './enrolment/enrolment.module';
import { MarksModule } from './marks/marks.module';
import { ReportsModule } from './reports/reports.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { FinanceModule } from './finance/finance.module';
import { PaymentModule } from './payment/payment.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { ExemptionsModule } from './exemptions/exemptions.module';
import { AttendanceModule } from './attendance/attendance.module';
import { APP_GUARD } from '@nestjs/core';
import { RolesGuard } from './auth/guards/roles.guard';
import { ActivityModule } from './activity/activity.module';
import { SystemModule } from './system/system.module';
import { NotificationsModule } from './notifications/notifications.module';
import { MessagingModule } from './messaging/messaging.module';
import { ContinuousAssessmentModule } from './continuous-assessment/continuous-assessment.module';
import { AIModule } from './ai/ai.module';
import { Logger, OnModuleInit, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { LoggingMiddleware } from './common/middleware/logging.middleware';
import { TenantModule } from './tenant/tenant.module';
import { TenantMiddleware } from './tenant/tenant.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: process.env.NODE_ENV
        ? `.env.${process.env.NODE_ENV}`
        : '.env.development',
      isGlobal: true, // Makes ConfigService available globally
    }),
    ProfilesModule,
    AuthModule,

    TypeOrmModule.forRootAsync({
      imports: [ConfigModule], // Make sure ConfigModule is imported so ConfigService can be injected
      useFactory: (configService: ConfigService) => {
        // Inject ConfigService here
        const databaseUrl = configService.get<string>('DATABASE_URL'); // For Render deployment

        // Get individual database configuration
        const dbHost = configService.get<string>('DB_HOST');
        const dbPort = configService.get<string>('DB_PORT');
        const dbUser = configService.get<string>('DB_USER');
        const dbPassword = configService.get<string>('DB_PASSWORD');
        const dbName = configService.get<string>('DB_NAME');

        // Construct the TypeORM options object dynamically
        const typeOrmOptions: TypeOrmModuleOptions = {
          type: 'postgres', // Database type

          // Conditionally use DATABASE_URL or individual host/port/user/password/db
          // This allows flexibility between Render's single URL and local environment variables.
          url: databaseUrl, // TypeORM can connect directly via a URL
          host: databaseUrl ? undefined : dbHost,
          port: databaseUrl ? undefined : dbPort ? parseInt(dbPort) : undefined,
          username: databaseUrl ? undefined : dbUser,
          password: databaseUrl ? undefined : dbPassword || '', // Ensure password is always a string
          database: databaseUrl ? undefined : dbName,
          // Your existing options:
          autoLoadEntities: true, // Keep this as you had it

          // IMPORTANT: synchronize should be false in production!
          // Use migrations for production deployments.
          // Set to true only for development for automatic schema creation.
          synchronize: process.env.NODE_ENV === 'development',
          
          // synchronize: true,

          // Optional: Enable logging in development for debugging queries
          // logging: process.env.NODE_ENV === 'development',

          // SSL configuration for production (e.g., Render)
          // Render's PostgreSQL often requires SSL with rejectUnauthorized: false
          ssl: databaseUrl ? { rejectUnauthorized: false } : false, // Apply SSL only if DATABASE_URL is used
          // which implies a production/cloud environment
        };

        return typeOrmOptions;
      },
      inject: [ConfigService], // Explicitly tell NestJS to inject ConfigService into useFactory
    }),

    ResourceByIdModule,
    EnrolmentModule,
    MarksModule,
    ReportsModule,
    FinanceModule,
    PaymentModule,
    DashboardModule,
    ExemptionsModule,
    AttendanceModule,
    ActivityModule,
    SystemModule,
    NotificationsModule,
    MessagingModule,
    ContinuousAssessmentModule,
    AIModule,
    TenantModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Removed global RolesGuard - it should be applied at controller level after AuthGuard
  ],
})
export class AppModule implements OnModuleInit, NestModule {
  private readonly logger = new Logger(AppModule.name);

  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TenantMiddleware).forRoutes('*');
    consumer.apply(LoggingMiddleware).forRoutes('*');
    this.logger.log('TenantMiddleware and LoggingMiddleware configured');
  }

  onModuleInit() {
    this.logger.log('AppModule initialized - All modules loaded');
    this.logger.log('Server should be ready to accept requests');
  }
}
