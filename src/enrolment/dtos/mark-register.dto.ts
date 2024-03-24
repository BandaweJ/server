import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsNumber, IsOptional, IsString } from 'class-validator';
import { StudentsEntity } from 'src/profiles/entities/students.entity';

export class MarkRegisterDto {
  @ApiProperty()
  @IsOptional()
  @IsNumber()
  id: number;

  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty()
  @IsNumber()
  num: number;

  @ApiProperty()
  @IsBoolean()
  present: boolean;

  @ApiProperty()
  student: StudentsEntity;

  @ApiProperty()
  @IsNumber()
  year: number;
}
