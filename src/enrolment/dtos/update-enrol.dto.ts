/* eslint-disable prettier/prettier */
import { PartialType } from '@nestjs/swagger';
import { EnrolDto } from './enrol.dto';

export class UpdateEnrolDto extends PartialType(EnrolDto) {}
