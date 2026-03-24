import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';
import { Residence } from '../models/residence.model';
import { StudentsEntity } from 'src/profiles/entities/students.entity';

export class EnrolDto {
  @ApiProperty()
  @IsNotEmpty()
  student: StudentsEntity;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty()
  @IsNumber()
  @IsOptional()
  num: number;

  @ApiProperty()
  @IsNumber()
  @IsOptional()
  year: number;

  @ApiProperty()
  @IsNumber()
  @IsOptional()
  termId?: number;

  @ApiProperty()
  @IsOptional()
  residence: Residence;
}
