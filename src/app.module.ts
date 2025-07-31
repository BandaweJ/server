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
import { APP_GUARD } from '@nestjs/core';
import { RolesGuard } from './auth/guards/roles.guard';

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

        // Construct the TypeORM options object dynamically
        const typeOrmOptions: TypeOrmModuleOptions = {
          type: 'postgres', // Database type

          // Conditionally use DATABASE_URL or individual host/port/user/password/db
          // This allows flexibility between Render's single URL and local environment variables.
          url: databaseUrl, // TypeORM can connect directly via a URL
          host: databaseUrl ? undefined : configService.get<string>('DB_HOST'),
          port: databaseUrl
            ? undefined
            : parseInt(configService.get<string>('DB_PORT')),
          username: databaseUrl
            ? undefined
            : configService.get<string>('DB_USER'),
          password: databaseUrl
            ? undefined
            : configService.get<string>('DB_PASSWORD'),
          database: databaseUrl
            ? undefined
            : configService.get<string>('DB_NAME'),
          // Your existing options:
          autoLoadEntities: true, // Keep this as you had it

          // IMPORTANT: synchronize should be false in production!
          // Use migrations for production deployments.
          // Set to true only for development for automatic schema creation.
          // synchronize: process.env.NODE_ENV === 'development',
          synchronize: true,

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
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule {}
