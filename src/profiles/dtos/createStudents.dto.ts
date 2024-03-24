import { ApiProperty } from '@nestjs/swagger';
import {
  IsDateString,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsPhoneNumber,
  IsString,
  Length,
  MinLength,
} from 'class-validator';

export class CreateStudentDto {
  // @ApiProperty()
  // @IsString()
  // @IsNotEmpty()
  // @Length(8, 8)
  // studentNumber: string;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  name: string;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  surname: string;

  @ApiProperty()
  @IsOptional()
  @IsDateString()
  dob?: Date;

  @ApiProperty()
  @IsString()
  gender: string;

  @ApiProperty()
  @IsOptional()
  @IsString()
  // @MinLength(10)
  idnumber: string;

  @ApiProperty()
  @IsOptional()
  @IsDateString()
  dateOfJoining?: Date;

  @ApiProperty()
  @IsOptional()
  @IsString()
  // @IsPhoneNumber('ZW')
  cell: string;

  @ApiProperty()
  @IsOptional()
  // @IsEmail()
  @IsString()
  email: string;

  @ApiProperty()
  @IsOptional()
  @IsString()
  address: string;

  @ApiProperty()
  @IsOptional()
  @IsString()
  prevSchool: string;

  @ApiProperty()
  @IsOptional()
  residence: 'Day' | 'Boarder';
}
