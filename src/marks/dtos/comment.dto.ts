import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';
import { StudentsEntity } from 'src/profiles/entities/students.entity';
import { ExamType } from '../models/examtype.enum';

export class CommentDto {
  @IsString()
  comment: string;

  @IsString()
  name: string;

  @IsNumber()
  num: number;

  @IsNumber()
  year: number;

  @IsNotEmpty()
  student: StudentsEntity;

  @IsOptional()
  id?: number;

  @IsOptional()
  examType?: ExamType;
}
