import { IsIn, IsString, MinLength } from 'class-validator';
import { ROLES } from '../models/roles.enum';
import { ApiProperty } from '@nestjs/swagger';

export class AccountsDto {
  @ApiProperty()
  @IsIn(['student', 'teacher', 'parent'])
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
