/* eslint-disable prettier/prettier */
import { SetMetadata } from '@nestjs/common';

export const HAS_PERMISSIONS_KEY = 'hasPermissions';
export const HasPermissions = (...permissions: string[]) => SetMetadata(HAS_PERMISSIONS_KEY, permissions);


