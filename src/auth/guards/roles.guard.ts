// src/auth/roles.guard.ts
import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { HAS_ROLES_KEY } from '../decorators/has-roles.decorator';
import { ROLES } from '../models/roles.enum';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // 1. Get required roles from the route handler metadata
    //    (e.g., from @HasRoles(ROLES.admin, ROLES.reception))
    const requiredRoles = this.reflector.getAllAndOverride<ROLES[]>(
      HAS_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    // If no roles are specified, allow access (meaning no @HasRoles decorator on the route)
    if (!requiredRoles) {
      return true;
    }

    // 2. Get the user from the request (assuming AuthGuard has already run and populated req.user)
    const { user } = context.switchToHttp().getRequest();

    // Ensure user and user.role exist
    if (!user || !user.role) {
      return false; // User not authenticated or role missing
    }

    // 3. Check if the user's role is included in the required roles
    //    'user.role' is expected to be a string that matches one of your ROLES enum values.
    return requiredRoles.includes(user.role as ROLES);
  }
}
