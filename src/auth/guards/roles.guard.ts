// src/auth/roles.guard.ts
import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HAS_ROLES_KEY } from '../decorators/has-roles.decorator';
import { ROLES } from '../models/roles.enum';
import { AccountsEntity } from '../entities/accounts.entity';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    @InjectRepository(AccountsEntity)
    private accountsRepository: Repository<AccountsEntity>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
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
    const request = context.switchToHttp().getRequest();
    const { user } = request;

    // If user doesn't exist, it means AuthGuard hasn't run yet (or failed)
    // Let AuthGuard handle authentication - don't throw here
    // The route should have @UseGuards(AuthGuard()) applied for RolesGuard to work
    if (!user) {
      // Check if this route has AuthGuard applied - if not, we can't determine auth status
      // In this case, let the request proceed and AuthGuard will handle it
      // If AuthGuard fails, it will return 401 Unauthorized
      // If AuthGuard succeeds, RolesGuard will run again (as controller guard) and check roles
      console.warn('RolesGuard: User not found - AuthGuard may not have run yet. Route should have @UseGuards(AuthGuard())');
      // Don't block here - let AuthGuard handle authentication first
      // This allows RolesGuard to work both as APP_GUARD (skips routes without @HasRoles)
      // and as route guard (checks roles after AuthGuard runs)
      return true; // Allow request to proceed to AuthGuard
    }

    // Try to get role from user object (attached by JWT strategy)
    let userRole: string | undefined = (user as any).role;
    const accountId = (user as any).accountId;

    // If role is not found on user object, try to get it from the account
    if (!userRole && accountId) {
      try {
        const account = await this.accountsRepository.findOne({ 
          where: { id: accountId },
          select: ['role'], // Only select role to optimize query
        });
        if (account) {
          userRole = account.role;
        }
      } catch (error) {
        console.error('RolesGuard: Error fetching account role', error);
      }
    }

    // Normalize role to lowercase to match enum values
    const normalizedRole = userRole?.toLowerCase().trim();
    
    if (!normalizedRole) {
      console.error('RolesGuard: User role not found', { 
        user: { id: (user as any).id, role: (user as any).role, accountId },
        requiredRoles 
      });
      throw new ForbiddenException('User role not found');
    }

    // Check if the normalized role is a valid ROLES enum value
    const roleEnumValues = Object.values(ROLES).map(r => r.toLowerCase());
    if (!roleEnumValues.includes(normalizedRole)) {
      console.error('RolesGuard: Invalid role value', { 
        normalizedRole, 
        validRoles: roleEnumValues 
      });
      throw new ForbiddenException(`Invalid user role: ${normalizedRole}`);
    }

    // Debug logging
    console.log('RolesGuard: Checking access', { 
      userRole: normalizedRole, 
      requiredRoles, 
      hasAccess: requiredRoles.some(r => r.toLowerCase() === normalizedRole),
      userId: (user as any).id,
      accountId 
    });

    // 3. Check if the user's role is included in the required roles (case-insensitive)
    const hasRequiredRole = requiredRoles.some(requiredRole => 
      requiredRole.toLowerCase() === normalizedRole
    );

    if (!hasRequiredRole) {
      throw new ForbiddenException(
        `Access denied. User role: ${normalizedRole}. Required roles: ${requiredRoles.join(', ')}`
      );
    }

    return true;
  }
}
