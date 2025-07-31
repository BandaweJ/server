// src/auth/has-roles.decorator.ts
import { SetMetadata } from '@nestjs/common';
import { ROLES } from '../models/roles.enum';

export const HAS_ROLES_KEY = 'roles'; // A unique key for our metadata

export const HasRoles = (...roles: ROLES[]) =>
  SetMetadata(HAS_ROLES_KEY, roles);
