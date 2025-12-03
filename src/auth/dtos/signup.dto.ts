import { IsEnum, IsIn, IsString, MinLength } from 'class-validator';
import { ROLES } from '../models/roles.enum';
import { ApiProperty } from '@nestjs/swagger';

export class AccountsDto {
  @ApiProperty({ enum: ROLES, description: 'User role' })
  @IsEnum(ROLES, { message: 'Invalid role. Valid roles are: teacher, student, parent, admin, reception, hod, auditor, director' })
  role: ROLES;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  username: string;

  @ApiProperty()
  @IsString()
  @MinLength(8)
  password: string;

  @ApiProperty()
  @IsString()
  id: string;
}
