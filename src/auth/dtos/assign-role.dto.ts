/* eslint-disable prettier/prettier */
import { IsUUID, IsString } from 'class-validator';

export class AssignRoleDto {
  @IsString()
  accountId: string;

  @IsUUID('4')
  roleId: string;
}


