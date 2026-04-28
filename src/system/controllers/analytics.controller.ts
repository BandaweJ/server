/* eslint-disable prettier/prettier */
import {
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { AnalyticsService } from '../services/analytics.service';

@Controller('system/analytics')
@UseGuards(JwtAuthGuard)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get()
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

    return await this.analyticsService.getAnalyticsSummary(start, end, num, year);
  }

  @Get('enrollment')
  async getEnrollmentAnalytics(
    @Query('termNum') termNum?: string,
    @Query('termYear') termYear?: string,
  ) {
    const num = termNum ? parseInt(termNum, 10) : undefined;
    const year = termYear ? parseInt(termYear, 10) : undefined;
    return await this.analyticsService.getEnrollmentAnalytics(num, year);
  }

  @Get('financial')
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

    return await this.analyticsService.getFinancialAnalytics(start, end, num, year);
  }

  @Get('academic')
  async getAcademicAnalytics(
    @Query('termNum') termNum?: string,
    @Query('termYear') termYear?: string,
  ) {
    const num = termNum ? parseInt(termNum, 10) : undefined;
    const year = termYear ? parseInt(termYear, 10) : undefined;
    return await this.analyticsService.getAcademicAnalytics(num, year);
  }

  @Get('users')
  async getUserActivityAnalytics() {
    return await this.analyticsService.getUserActivityAnalytics();
  }

  @Get('system')
  async getSystemAnalytics() {
    return await this.analyticsService.getSystemAnalytics();
  }
}

