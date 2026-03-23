/* eslint-disable prettier/prettier */
import {
  Controller,
  ForbiddenException,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { RolesPermissionsService } from '../services/roles-permissions.service';
import { CreateRoleDto } from '../dtos/create-role.dto';
import { UpdateRoleDto } from '../dtos/update-role.dto';
import { CreatePermissionDto } from '../dtos/create-permission.dto';
import { UpdatePermissionDto } from '../dtos/update-permission.dto';
import { AssignRoleDto } from '../dtos/assign-role.dto';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';
import { HasRoles } from '../decorators/has-roles.decorator';
import { ROLES } from '../models/roles.enum';

@Controller('system/roles-permissions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RolesPermissionsController {
  constructor(private readonly rolesPermissionsService: RolesPermissionsService) {}

  private isPrivilegedRole(role?: string | ROLES): boolean {
    return [ROLES.admin, ROLES.director, ROLES.dev].includes(role as ROLES);
  }

  private assertSelfOrPrivileged(req: { user?: { accountId?: string; id?: string; role?: string } }, accountId: string): void {
    const role = req.user?.role;
    const currentAccountId = req.user?.accountId || req.user?.id;
    if (this.isPrivilegedRole(role as ROLES)) return;
    if (currentAccountId && currentAccountId === accountId) return;
    throw new ForbiddenException('You are not allowed to access these permissions');
  }

  // Role endpoints
  @Post('roles')
  @HttpCode(HttpStatus.CREATED)
  @HasRoles(ROLES.admin, ROLES.director, ROLES.dev)
  async createRole(@Body() createRoleDto: CreateRoleDto) {
    return await this.rolesPermissionsService.createRole(createRoleDto);
  }

  @Get('roles')
  @HasRoles(ROLES.admin, ROLES.director, ROLES.auditor, ROLES.dev)
  async findAllRoles(@Query('includeInactive') includeInactive?: string) {
    const include = includeInactive === 'true';
    return await this.rolesPermissionsService.findAllRoles(include);
  }

  @Get('roles/:id')
  @HasRoles(ROLES.admin, ROLES.director, ROLES.auditor, ROLES.dev)
  async findRoleById(@Param('id') id: string) {
    return await this.rolesPermissionsService.findRoleById(id);
  }

  @Put('roles/:id')
  @HasRoles(ROLES.admin, ROLES.director, ROLES.dev)
  async updateRole(@Param('id') id: string, @Body() updateRoleDto: UpdateRoleDto) {
    return await this.rolesPermissionsService.updateRole(id, updateRoleDto);
  }

  @Delete('roles/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @HasRoles(ROLES.admin, ROLES.director, ROLES.dev)
  async deleteRole(@Param('id') id: string) {
    await this.rolesPermissionsService.deleteRole(id);
  }

  // Permission endpoints
  @Post('permissions')
  @HttpCode(HttpStatus.CREATED)
  @HasRoles(ROLES.admin, ROLES.director, ROLES.dev)
  async createPermission(@Body() createPermissionDto: CreatePermissionDto) {
    return await this.rolesPermissionsService.createPermission(createPermissionDto);
  }

  @Get('permissions')
  @HasRoles(ROLES.admin, ROLES.director, ROLES.auditor, ROLES.dev)
  async findAllPermissions(@Query('includeInactive') includeInactive?: string) {
    const include = includeInactive === 'true';
    return await this.rolesPermissionsService.findAllPermissions(include);
  }

  @Get('permissions/:id')
  @HasRoles(ROLES.admin, ROLES.director, ROLES.auditor, ROLES.dev)
  async findPermissionById(@Param('id') id: string) {
    return await this.rolesPermissionsService.findPermissionById(id);
  }

  @Put('permissions/:id')
  @HasRoles(ROLES.admin, ROLES.director, ROLES.dev)
  async updatePermission(@Param('id') id: string, @Body() updatePermissionDto: UpdatePermissionDto) {
    return await this.rolesPermissionsService.updatePermission(id, updatePermissionDto);
  }

  @Delete('permissions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @HasRoles(ROLES.admin, ROLES.director, ROLES.dev)
  async deletePermission(@Param('id') id: string) {
    await this.rolesPermissionsService.deletePermission(id);
  }

  // Assign role to account
  @Post('assign-role')
  @HttpCode(HttpStatus.OK)
  @HasRoles(ROLES.admin, ROLES.director, ROLES.dev)
  async assignRoleToAccount(@Body() assignRoleDto: AssignRoleDto) {
    return await this.rolesPermissionsService.assignRoleToAccount(assignRoleDto);
  }

  // Get user permissions
  @Get('user/:accountId/permissions')
  @HasRoles(ROLES.admin, ROLES.director, ROLES.dev, ROLES.parent, ROLES.student, ROLES.teacher, ROLES.reception, ROLES.hod, ROLES.auditor)
  async getUserPermissions(@Param('accountId') accountId: string, @Req() req: { user?: { accountId?: string; id?: string; role?: string } }) {
    this.assertSelfOrPrivileged(req, accountId);
    const permissions = await this.rolesPermissionsService.getUserPermissions(accountId);
    return { permissions };
  }

  // Check permission
  @Get('user/:accountId/has-permission/:permissionName')
  @HasRoles(ROLES.admin, ROLES.director, ROLES.dev, ROLES.parent, ROLES.student, ROLES.teacher, ROLES.reception, ROLES.hod, ROLES.auditor)
  async hasPermission(
    @Param('accountId') accountId: string,
    @Param('permissionName') permissionName: string,
    @Req() req: { user?: { accountId?: string; id?: string; role?: string } },
  ) {
    this.assertSelfOrPrivileged(req, accountId);
    const hasPermission = await this.rolesPermissionsService.hasPermission(accountId, permissionName);
    return { hasPermission };
  }

  // Seed default role permissions (admin only endpoint)
  @Post('seed-role-permissions')
  @HttpCode(HttpStatus.OK)
  @HasRoles(ROLES.admin, ROLES.director, ROLES.dev)
  async seedRolePermissions() {
    await this.rolesPermissionsService.seedDefaultRolePermissions();
    return { message: 'Role permissions seeded successfully' };
  }

}

