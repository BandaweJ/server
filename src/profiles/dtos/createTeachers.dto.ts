/* eslint-disable prettier/prettier */
import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsOptional,
  IsPhoneNumber,
  IsString,
  MinLength,
} from 'class-validator';
import { ROLES } from 'src/auth/models/roles.enum';

export class CreateTeacherDto {
  @ApiProperty()
  @IsString()
  @MinLength(10)
  id: string;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  name: string;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  surname: string;

  @ApiProperty()
  @IsDateString()
  @IsOptional()
  dob?: Date;

  @ApiProperty()
  @IsString()
  gender: string;

  @ApiProperty()
  @IsString()
  title: string;

  @ApiProperty()
  @IsDateString()
  @IsOptional()
  dateOfJoining?: Date;

  @ApiProperty()
  @IsArray()
  qualifications: string[];

  @ApiProperty()
  @IsBoolean()
  @IsOptional()
  active: boolean;

  @ApiProperty()
  @IsString()
  // @IsPhoneNumber()
  cell: string;

  @ApiProperty()
  @IsEmail()
  email: string;

  @ApiProperty()
  @IsString()
  address: string;

  @ApiProperty()
  @IsOptional()
  @IsDateString()
  dateOfLeaving?: Date;

  @ApiProperty()
  @IsOptional()
  @IsString()
  role?: ROLES;
}
