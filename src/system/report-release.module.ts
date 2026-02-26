import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReportReleaseService } from './report-release.service';
import { ReportReleaseController } from './report-release.controller';
import { ReportReleaseSettings } from './entities/report-release-settings.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ReportReleaseSettings])],
  controllers: [ReportReleaseController],
  providers: [ReportReleaseService],
  exports: [ReportReleaseService],
})
export class ReportReleaseModule {}
