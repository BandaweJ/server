/* eslint-disable prettier/prettier */
import {
  Controller,
  Get,
  Logger,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { AnalyticsService } from '../services/analytics.service';
import { PermissionsGuard } from 'src/auth/guards/permissions.guard';
import { HasPermissions } from 'src/auth/decorators/has-permissions.decorator';
import { PERMISSIONS } from 'src/auth/models/permissions.constants';

@Controller('system/analytics')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AnalyticsController {
  private readonly logger = new Logger(AnalyticsController.name);

  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get()
  @HasPermissions(PERMISSIONS.SYSTEM.VIEW_AUDIT)
  async getAnalytics(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('termNum') termNum?: string,
    @Query('termYear') termYear?: string,
  ) {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;
    const num = termNum ? parseInt(termNum, 10) : undefined;
    const year = termYear ? parseInt(termYear, 10) : undefined;

    this.logger.log(
      `Analytics summary requested term=${num ?? 'all'}/${year ?? 'all'} range=${startDate ?? 'none'}..${endDate ?? 'none'}`,
    );
    return await this.analyticsService.getAnalyticsSummary(start, end, num, year);
  }

  @Get('enrollment')
  @HasPermissions(PERMISSIONS.SYSTEM.VIEW_AUDIT)
  async getEnrollmentAnalytics(
    @Query('termNum') termNum?: string,
    @Query('termYear') termYear?: string,
  ) {
    const num = termNum ? parseInt(termNum, 10) : undefined;
    const year = termYear ? parseInt(termYear, 10) : undefined;
    this.logger.log(`Enrollment analytics requested term=${num ?? 'all'}/${year ?? 'all'}`);
    return await this.analyticsService.getEnrollmentAnalytics(num, year);
  }

  @Get('financial')
  @HasPermissions(PERMISSIONS.SYSTEM.VIEW_AUDIT)
  async getFinancialAnalytics(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('termNum') termNum?: string,
    @Query('termYear') termYear?: string,
  ) {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;
    const num = termNum ? parseInt(termNum, 10) : undefined;
    const year = termYear ? parseInt(termYear, 10) : undefined;

    this.logger.log(`Financial analytics requested term=${num ?? 'all'}/${year ?? 'all'}`);
    return await this.analyticsService.getFinancialAnalytics(start, end, num, year);
  }

  @Get('academic')
  @HasPermissions(PERMISSIONS.SYSTEM.VIEW_AUDIT)
  async getAcademicAnalytics(
    @Query('termNum') termNum?: string,
    @Query('termYear') termYear?: string,
  ) {
    const num = termNum ? parseInt(termNum, 10) : undefined;
    const year = termYear ? parseInt(termYear, 10) : undefined;
    this.logger.log(`Academic analytics requested term=${num ?? 'all'}/${year ?? 'all'}`);
    return await this.analyticsService.getAcademicAnalytics(num, year);
  }

  @Get('users')
  @HasPermissions(PERMISSIONS.SYSTEM.VIEW_AUDIT)
  async getUserActivityAnalytics() {
    return await this.analyticsService.getUserActivityAnalytics();
  }

  @Get('system')
  @HasPermissions(PERMISSIONS.SYSTEM.VIEW_AUDIT)
  async getSystemAnalytics() {
    return await this.analyticsService.getSystemAnalytics();
  }

  @Get('metrics')
  @HasPermissions(PERMISSIONS.SYSTEM.VIEW_AUDIT)
  async getMetricCatalog() {
    return await this.analyticsService.getMetricCatalog();
  }

  @Get('data-quality')
  @HasPermissions(PERMISSIONS.SYSTEM.VIEW_AUDIT)
  async getDataQualityAnalytics(
    @Query('termNum') termNum?: string,
    @Query('termYear') termYear?: string,
  ) {
    const num = termNum ? parseInt(termNum, 10) : undefined;
    const year = termYear ? parseInt(termYear, 10) : undefined;
    return await this.analyticsService.getDataQualityAnalytics(num, year);
  }

  @Get('predictions')
  @HasPermissions(PERMISSIONS.SYSTEM.VIEW_AUDIT)
  async getPredictionsAnalytics(
    @Query('termNum') termNum?: string,
    @Query('termYear') termYear?: string,
  ) {
    const num = termNum ? parseInt(termNum, 10) : undefined;
    const year = termYear ? parseInt(termYear, 10) : undefined;
    return await this.analyticsService.getPredictionsAnalytics(num, year);
  }
}

