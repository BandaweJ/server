/* eslint-disable prettier/prettier */
import {
  Body,
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { CreateExemptionDto } from './dtos/createExemption.dto';
import { UpdateExemptionDto } from './dtos/updateExemption.dto';
import { ExemptionService } from './exemptions.service';
import { AuthGuard } from '@nestjs/passport';
import { ExemptionType } from './enums/exemptions-type.enum';

@UseGuards(AuthGuard())
@Controller('exemptions')
export class ExemptionsController {
  constructor(private readonly exemptionService: ExemptionService) {}

  /**
   * Create a new exemption
   */
  @Post()
  saveExemption(@Body() createExemptionDto: CreateExemptionDto) {
    return this.exemptionService.saveExemption(createExemptionDto);
  }

  /**
   * Get all exemptions with optional filters
   */
  @Get()
  getAllExemptions(
    @Query('studentNumber') studentNumber?: string,
    @Query('type') type?: ExemptionType,
    @Query('isActive') isActive?: string,
  ) {
    const isActiveBoolean =
      isActive !== undefined ? isActive === 'true' : undefined;
    return this.exemptionService.getAllExemptions(
      studentNumber,
      type,
      isActiveBoolean,
    );
  }

  /**
   * Get exemption by student number
   * Must be before :id route to avoid route conflicts
   */
  @Get('student/:studentNumber')
  getExemptionByStudent(@Param('studentNumber') studentNumber: string) {
    return this.exemptionService.getExemptionByStudentNumber(studentNumber);
  }

  /**
   * Get exemption by ID
   */
  @Get(':id')
  getExemptionById(@Param('id', ParseIntPipe) id: number) {
    return this.exemptionService.getExemptionById(id);
  }

  /**
   * Update exemption by ID
   */
  @Put(':id')
  updateExemption(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateExemptionDto: UpdateExemptionDto,
  ) {
    return this.exemptionService.updateExemption(id, updateExemptionDto);
  }

  /**
   * Delete exemption by ID
   */
  @Delete(':id')
  deleteExemption(@Param('id', ParseIntPipe) id: number) {
    return this.exemptionService.deleteExemption(id);
  }
}
