import { ROLES } from './roles.enum';
export interface JwtPayload {
  username: string;
  role: ROLES;
  id: string;
}
