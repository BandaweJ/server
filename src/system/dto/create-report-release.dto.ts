import {
  IsNotEmpty,
  IsInt,
  IsEnum,
  IsOptional,
  IsString,
  IsBoolean,
  IsDateString,
} from 'class-validator';

export class CreateReportReleaseDto {
  @IsNotEmpty()
  @IsInt()
  termNumber: number;

  @IsNotEmpty()
  @IsInt()
  termYear: number;

  @IsNotEmpty()
  @IsEnum(['Mid Term', 'End Of Term'])
  examType: 'Mid Term' | 'End Of Term';

  @IsOptional()
  @IsBoolean()
  isReleased?: boolean = false;

  @IsOptional()
  @IsDateString()
  scheduledReleaseDate?: string;

  @IsOptional()
  @IsString()
  releaseNotes?: string;

  @IsOptional()
  @IsBoolean()
  sendNotification?: boolean = true;
}
