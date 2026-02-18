/* eslint-disable prettier/prettier */
import { TeachersEntity } from 'src/profiles/entities/teachers.entity';
import { ROLES } from './roles.enum';
export interface JwtPayload {
  username: string;
  role: string;
  id: string;
  tenantSlug?: string;
  tenantId?: string;
}
