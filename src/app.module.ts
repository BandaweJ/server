/* eslint-disable prettier/prettier */
import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ProfilesModule } from './profiles/profiles.module';
import { AuthModule } from './auth/auth.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ResourceByIdModule } from './resource-by-id/resource-by-id.module';
import { EnrolmentModule } from './enrolment/enrolment.module';
import { MarksModule } from './marks/marks.module';
import { ReportsModule } from './reports/reports.module';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import * as path from 'path';
import { FinanceModule } from './finance/finance.module';
import { PaymentModule } from './payment/payment.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ProfilesModule,
    AuthModule,
    ServeStaticModule.forRoot({
      rootPath: path.join(__dirname, '..', 'public'), // Adjust path as needed
    }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT),
      username: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      autoLoadEntities: true,
      synchronize: true,
    }),
    ResourceByIdModule,
    EnrolmentModule,
    MarksModule,
    ReportsModule,
    FinanceModule,
    PaymentModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
