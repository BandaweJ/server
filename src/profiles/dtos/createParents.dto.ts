import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsPhoneNumber,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateParentsDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @IsEmail()
  email: string;

  @ApiProperty()
  @IsString()
  @MaxLength(30)
  @MinLength(2)
  surname: string;

  @ApiProperty()
  @IsString()
  sex: string;

  @ApiProperty()
  @IsString()
  title: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  // @MinLength(10)
  idnumber: string;

  @ApiProperty()
  @IsString()
  @IsPhoneNumber('ZW')
  cell: string;

  @ApiProperty()
  @IsString()
  address: string;
}
