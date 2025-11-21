import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ROLES_KEY } from '../decorators/roles.decorator';
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
    const requiredRoles = this.reflector.getAllAndOverride<ROLES[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const { user } = request;

    if (!user) {
      console.warn('RolesGuard: User not found - AuthGuard may not have run yet. Route should have @UseGuards(AuthGuard())');
      return true;
    }

    let userRole: string | undefined = (user as any).role;
    const accountId = (user as any).accountId;

    if (!userRole && accountId) {
      try {
        const account = await this.accountsRepository.findOne({
          where: { id: accountId },
          select: ['role'],
        });
        if (account) {
          userRole = account.role;
        }
      } catch (error) {
        console.error('RolesGuard: Error fetching account role', error);
      }
    }

    const normalizedRole = userRole?.toLowerCase().trim();

    if (!normalizedRole) {
      console.error('RolesGuard: User role not found', {
        user: { id: (user as any).id, role: (user as any).role, accountId },
        requiredRoles
      });
      throw new ForbiddenException('User role not found');
    }

    const roleEnumValues = Object.values(ROLES).map(r => r.toLowerCase());
    if (!roleEnumValues.includes(normalizedRole)) {
      console.error('RolesGuard: Invalid role value', {
        normalizedRole,
        validRoles: roleEnumValues
      });
      throw new ForbiddenException(`Invalid user role: ${normalizedRole}`);
    }

    console.log('RolesGuard: Checking access', {
      userRole: normalizedRole,
      requiredRoles,
      hasAccess: requiredRoles.some(r => r.toLowerCase() === normalizedRole),
      userId: (user as any).id,
      accountId
    });

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
