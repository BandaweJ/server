import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReportReleaseService } from './report-release.service';
import { ReportReleaseController } from './report-release.controller';
import { ReportReleaseSettings } from './entities/report-release-settings.entity';
import { TermsEntity } from '../enrolment/entities/term.entity';
import { AccountsEntity } from '../auth/entities/accounts.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([ReportReleaseSettings]),
    TypeOrmModule.forFeature([TermsEntity]),
    TypeOrmModule.forFeature([AccountsEntity]),
  ],
  controllers: [ReportReleaseController],
  providers: [ReportReleaseService],
  exports: [ReportReleaseService],
})
export class ReportReleaseModule {}
