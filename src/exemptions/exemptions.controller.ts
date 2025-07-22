/* eslint-disable prettier/prettier */
import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { CreateExemptionDto } from './dtos/createExemption.dto';
import { ExemptionService } from './exemptions.service';
import { AuthGuard } from '@nestjs/passport';

@UseGuards(AuthGuard())
@Controller('exemptions')
export class ExemptionsController {
  constructor(private readonly exemptionService: ExemptionService) {}

  @Post()
  saveExemption(@Body() createExemptionDto: CreateExemptionDto) {
    return this.exemptionService.saveExemption(createExemptionDto);
  }
}
