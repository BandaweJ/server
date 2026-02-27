import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { ReportReleaseService } from './report-release.service';
import { CreateReportReleaseDto } from './dto/create-report-release.dto';
import { UpdateReportReleaseDto } from './dto/update-report-release.dto';
import { BulkUpdateReportReleaseDto } from './dto/bulk-update-report-release.dto';
import { ReportReleaseSettings } from './entities/report-release-settings.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ROLES } from '../auth/models/roles.enum';

@ApiTags('Report Release Settings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('system/report-releases')
export class ReportReleaseController {
  constructor(private readonly reportReleaseService: ReportReleaseService) {}

  @Post()
  @Roles(ROLES.admin, ROLES.director)
  @ApiOperation({ summary: 'Create a new report release setting' })
  @ApiResponse({ status: 201, description: 'Report release setting created successfully', type: ReportReleaseSettings })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  create(@Body() createDto: CreateReportReleaseDto, @Request() req): Promise<ReportReleaseSettings> {
    return this.reportReleaseService.create(createDto, req.user);
  }

  @Get()
  @Roles(ROLES.admin, ROLES.director, ROLES.teacher)
  @ApiOperation({ summary: 'Get all report release settings' })
  @ApiResponse({ status: 200, description: 'List of all report release settings', type: [ReportReleaseSettings] })
  findAll(): Promise<ReportReleaseSettings[]> {
    return this.reportReleaseService.findAll();
  }

  @Get('available')
  @ApiOperation({ summary: 'Get all released exam sessions' })
  @ApiResponse({ status: 200, description: 'List of released exam sessions', type: [ReportReleaseSettings] })
  getAvailable(): Promise<ReportReleaseSettings[]> {
    return this.reportReleaseService.getAvailableExamSessions();
  }

  @Get('check')
  @ApiOperation({ summary: 'Check if a specific exam session is released' })
  @ApiResponse({ status: 200, description: 'Release status of the exam session' })
  checkReleaseStatus(
    @Query('termNumber') termNumber: number,
    @Query('termYear') termYear: number,
    @Query('examType') examType: string,
  ): Promise<{ isReleased: boolean }> {
    return this.reportReleaseService.checkReleaseStatus(termNumber, termYear, examType)
      .then(isReleased => ({ isReleased }));
  }

  @Get('scheduled')
  @Roles(ROLES.admin, ROLES.director)
  @ApiOperation({ summary: 'Get scheduled releases for the next 24 hours' })
  @ApiResponse({ status: 200, description: 'List of scheduled releases', type: [ReportReleaseSettings] })
  getScheduled(): Promise<ReportReleaseSettings[]> {
    return this.reportReleaseService.getScheduledReleases();
  }

  @Post('generate-from-terms')
  @Roles(ROLES.admin, ROLES.director)
  @ApiOperation({ summary: 'Generate report release settings from existing terms in database' })
  @ApiResponse({ status: 200, description: 'Report release settings generated from terms', type: [ReportReleaseSettings] })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  generateFromTerms(): Promise<ReportReleaseSettings[]> {
    return this.reportReleaseService.generateExamSessionsFromTerms();
  }

  @Get('generate-sessions')
  @Roles(ROLES.admin, ROLES.director)
  @ApiOperation({ summary: 'Generate exam sessions for current and next year (legacy)' })
  @ApiResponse({ status: 200, description: 'Generated exam sessions', type: [ReportReleaseSettings] })
  generateSessions(@Query('year') year?: number): Promise<Partial<ReportReleaseSettings>[]> {
    return this.reportReleaseService.generateExamSessions(year);
  }

  @Get(':id')
  @Roles(ROLES.admin, ROLES.director, ROLES.teacher)
  @ApiOperation({ summary: 'Get a specific report release setting by ID' })
  @ApiResponse({ status: 200, description: 'Report release setting found', type: ReportReleaseSettings })
  @ApiResponse({ status: 404, description: 'Report release setting not found' })
  findOne(@Param('id') id: string): Promise<ReportReleaseSettings> {
    return this.reportReleaseService.findOne(id);
  }

  @Patch(':id')
  @Roles(ROLES.admin, ROLES.director)
  @ApiOperation({ summary: 'Update a report release setting' })
  @ApiResponse({ status: 200, description: 'Report release setting updated successfully', type: ReportReleaseSettings })
  @ApiResponse({ status: 404, description: 'Report release setting not found' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  update(
    @Param('id') id: string,
    @Body() updateDto: UpdateReportReleaseDto,
    @Request() req,
  ): Promise<ReportReleaseSettings> {
    return this.reportReleaseService.update(id, updateDto, req.user);
  }

  @Patch('bulk-update')
  @Roles(ROLES.admin, ROLES.director)
  @ApiOperation({ summary: 'Bulk update multiple report release settings' })
  @ApiResponse({ status: 200, description: 'Report release settings updated successfully', type: [ReportReleaseSettings] })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  bulkUpdate(
    @Body() bulkUpdateDto: BulkUpdateReportReleaseDto,
    @Request() req,
  ): Promise<ReportReleaseSettings[]> {
    return this.reportReleaseService.bulkUpdate(bulkUpdateDto, req.user);
  }

  @Patch('process-scheduled')
  @Roles(ROLES.admin, ROLES.director)
  @ApiOperation({ summary: 'Process scheduled releases (cron job endpoint)' })
  @ApiResponse({ status: 200, description: 'Scheduled releases processed successfully', type: [ReportReleaseSettings] })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  processScheduled(): Promise<ReportReleaseSettings[]> {
    return this.reportReleaseService.processScheduledReleases();
  }

  @Delete(':id')
  @Roles(ROLES.admin, ROLES.director)
  @ApiOperation({ summary: 'Delete a report release setting' })
  @ApiResponse({ status: 200, description: 'Report release setting deleted successfully' })
  @ApiResponse({ status: 404, description: 'Report release setting not found' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  remove(@Param('id') id: string): Promise<void> {
    return this.reportReleaseService.remove(id);
  }
}
