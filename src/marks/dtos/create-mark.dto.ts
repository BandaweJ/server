import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';
import { SubjectsEntity } from '../entities/subjects.entity';
import { StudentsEntity } from 'src/profiles/entities/students.entity';
import { ApiProperty } from '@nestjs/swagger';
import { ExamType } from '../models/examtype.enum';

export class CreateMarkDto {
  @ApiProperty()
  @IsNumber()
  @IsNotEmpty()
  num: number;

  @ApiProperty()
  @IsNumber()
  @IsNotEmpty()
  year: number;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty()
  @IsNumber()
  @IsNotEmpty()
  mark: number;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  comment: string;

  @IsOptional()
  examType?: ExamType;

  @ApiProperty()
  @IsNotEmpty()
  subject: SubjectsEntity;

  @ApiProperty()
  @IsNotEmpty()
  student: StudentsEntity;

  @ApiProperty()
  @IsOptional()
  id?: number;
}
