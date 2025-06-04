/* eslint-disable prettier/prettier */
import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { StudentsEntity } from 'src/profiles/entities/students.entity';
import { FeesEntity } from '../entities/fees.entity';
import { EnrolEntity } from 'src/enrolment/entities/enrol.entity';

export class CreateBillDto {
  @ApiProperty()
  @IsOptional()
  id?: number;

  @ApiProperty()
  student: StudentsEntity;

  @ApiProperty()
  fees: FeesEntity;

  @ApiProperty()
  enrol: EnrolEntity;
}
