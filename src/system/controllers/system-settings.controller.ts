/* eslint-disable prettier/prettier */
import {
  Controller,
  Get,
  Put,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { HasRoles } from 'src/auth/decorators/has-roles.decorator';
import { ROLES } from 'src/auth/models/roles.enum';
import { SystemSettingsService, SystemSettingsDto } from '../services/system-settings.service';

@Controller('system/settings')
export class SystemSettingsController {
  constructor(private readonly systemSettingsService: SystemSettingsService) {}

  @Get()
  // Public endpoint - no auth required for reading settings (needed for header/logo display)
  async getSettings() {
    return await this.systemSettingsService.getSettings();
  }

  @Put()
  @UseGuards(AuthGuard(), RolesGuard)
  @HasRoles(ROLES.admin, ROLES.director)
  @HttpCode(HttpStatus.OK)
  async updateSettings(@Body() updateDto: SystemSettingsDto) {
    return await this.systemSettingsService.updateSettings(updateDto);
  }

  @Post('reset')
  @UseGuards(AuthGuard(), RolesGuard)
  @HasRoles(ROLES.admin)
  @HttpCode(HttpStatus.OK)
  async resetToDefaults() {
    return await this.systemSettingsService.resetToDefaults();
  }
}

