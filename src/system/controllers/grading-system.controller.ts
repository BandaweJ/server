/* eslint-disable prettier/prettier */
import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { GradingSystemService, GradeThresholds } from '../services/grading-system.service';

@Controller('system/grading')
@UseGuards(JwtAuthGuard)
export class GradingSystemController {
  constructor(private readonly gradingSystemService: GradingSystemService) {}

  @Get()
  async getAllGradingSystems() {
    return await this.gradingSystemService.getAllGradingSystems();
  }

  @Get(':level')
  async getGradingSystem(@Param('level') level: string) {
    return await this.gradingSystemService.getGradingSystem(level);
  }

  @Post()
  async saveGradingSystem(
    @Body()
    body: {
      level: string;
      gradeThresholds: GradeThresholds;
      failGrade: string;
    },
  ) {
    return await this.gradingSystemService.saveGradingSystem(
      body.level,
      body.gradeThresholds,
      body.failGrade,
    );
  }

  @Put(':level')
  async updateGradingSystem(
    @Param('level') level: string,
    @Body()
    body: {
      gradeThresholds: GradeThresholds;
      failGrade: string;
    },
  ) {
    return await this.gradingSystemService.saveGradingSystem(
      level,
      body.gradeThresholds,
      body.failGrade,
    );
  }
}

