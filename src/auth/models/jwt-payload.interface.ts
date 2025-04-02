/* eslint-disable prettier/prettier */
import { ROLES } from './roles.enum';
export interface JwtPayload {
  username: string;
  role: string;
  id: string;
}
