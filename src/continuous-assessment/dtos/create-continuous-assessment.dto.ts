import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsUUID,
  IsDateString,
  MaxLength,
} from 'class-validator';

export class CreateContinuousAssessmentDto {
  @IsString()
  @IsNotEmpty()
  studentId: string;

  @IsNumber()
  @IsNotEmpty()
  classId: number;

  @IsOptional()
  @IsString()
  subjectCode?: string;

  @IsString()
  @MaxLength(255)
  topicOrSkill: string;

  @IsDateString()
  assessmentDate: string;

  @IsNumber()
  score: number;

  @IsOptional()
  @IsNumber()
  maxScore?: number;

  @IsOptional()
  @IsString()
  assessmentType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  cohort?: string;
}

