/* eslint-disable prettier/prettier */
import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { IntegrationService, CreateIntegrationDto, UpdateIntegrationDto } from '../services/integration.service';
import { IntegrationType } from '../entities/integration.entity';

@Controller('system/integrations')
@UseGuards(JwtAuthGuard)
export class IntegrationController {
  constructor(private readonly integrationService: IntegrationService) {}
  
  // Test endpoint to check if AuthGuard works (must be before :id route)
  @Get('test-auth')
  async testAuth() {
    return { message: 'AuthGuard is working', timestamp: new Date() };
  }

  // Specific routes must come before parameterized routes
  @Get('summary')
  async getIntegrationStatusSummary() {
    return await this.integrationService.getIntegrationStatusSummary();
  }

  @Get('type/:type')
  async getIntegrationsByType(@Param('type') type: IntegrationType) {
    return await this.integrationService.getIntegrationsByType(type);
  }

  @Get()
  async getAllIntegrations() {
    return await this.integrationService.getAllIntegrations();
  }

  @Get(':id')
  async getIntegrationById(@Param('id') id: string) {
    return await this.integrationService.getIntegrationById(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createIntegration(@Body() createDto: CreateIntegrationDto) {
    return await this.integrationService.createIntegration(createDto);
  }

  @Put(':id')
  @HttpCode(HttpStatus.OK)
  async updateIntegration(
    @Param('id') id: string,
    @Body() updateDto: UpdateIntegrationDto,
  ) {
    return await this.integrationService.updateIntegration(id, updateDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteIntegration(@Param('id') id: string) {
    await this.integrationService.deleteIntegration(id);
  }

  @Post(':id/test')
  @HttpCode(HttpStatus.OK)
  async testIntegration(@Param('id') id: string) {
    return await this.integrationService.testIntegration(id);
  }
}

