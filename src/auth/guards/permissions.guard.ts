/* eslint-disable prettier/prettier */
import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { HAS_PERMISSIONS_KEY } from '../decorators/has-permissions.decorator';
import { RolesPermissionsService } from '../services/roles-permissions.service';
import { AccountsEntity } from '../entities/accounts.entity';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private rolesPermissionsService: RolesPermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // 1. Get required permissions from the route handler metadata
    //    (e.g., from @HasPermissions('user.create', 'finance.view'))
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      HAS_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    // If no permissions are specified, allow access (meaning no @HasPermissions decorator on the route)
    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    // 2. Get the user from the request (assuming AuthGuard has already run and populated req.user)
    const { user } = context.switchToHttp().getRequest();

    // Ensure user exists
    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    // 3. Get the account ID from the user object
    // The JWT strategy attaches accountId to the user profile (see jwt.strategy.ts line 95)
    const accountId = (user as any).accountId;
    
    if (!accountId) {
      throw new ForbiddenException('User account ID not found');
    }

    // 4. Check if the user has all required permissions
    for (const permission of requiredPermissions) {
      const hasPermission = await this.rolesPermissionsService.hasPermission(
        accountId,
        permission,
      );
      if (!hasPermission) {
        throw new ForbiddenException(`Missing required permission: ${permission}`);
      }
    }

    return true;
  }
}


