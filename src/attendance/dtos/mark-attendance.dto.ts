import { IsBoolean, IsDateString, IsNotEmpty, IsNumber, IsString } from 'class-validator';

export class MarkAttendanceDto {
  @IsString()
  @IsNotEmpty()
  studentNumber: string;

  @IsString()
  @IsNotEmpty()
  className: string;

  @IsNumber()
  termNum: number;

  @IsNumber()
  year: number;

  @IsBoolean()
  present: boolean;

  @IsDateString()
  date: string;
}

