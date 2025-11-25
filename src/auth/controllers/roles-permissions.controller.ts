/* eslint-disable prettier/prettier */
import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
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

@Controller('system/roles-permissions')
@UseGuards(JwtAuthGuard)
export class RolesPermissionsController {
  constructor(private readonly rolesPermissionsService: RolesPermissionsService) {}

  // Role endpoints
  @Post('roles')
  @HttpCode(HttpStatus.CREATED)
  async createRole(@Body() createRoleDto: CreateRoleDto) {
    return await this.rolesPermissionsService.createRole(createRoleDto);
  }

  @Get('roles')
  async findAllRoles(@Query('includeInactive') includeInactive?: string) {
    const include = includeInactive === 'true';
    return await this.rolesPermissionsService.findAllRoles(include);
  }

  @Get('roles/:id')
  async findRoleById(@Param('id') id: string) {
    return await this.rolesPermissionsService.findRoleById(id);
  }

  @Put('roles/:id')
  async updateRole(@Param('id') id: string, @Body() updateRoleDto: UpdateRoleDto) {
    return await this.rolesPermissionsService.updateRole(id, updateRoleDto);
  }

  @Delete('roles/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteRole(@Param('id') id: string) {
    await this.rolesPermissionsService.deleteRole(id);
  }

  // Permission endpoints
  @Post('permissions')
  @HttpCode(HttpStatus.CREATED)
  async createPermission(@Body() createPermissionDto: CreatePermissionDto) {
    return await this.rolesPermissionsService.createPermission(createPermissionDto);
  }

  @Get('permissions')
  async findAllPermissions(@Query('includeInactive') includeInactive?: string) {
    const include = includeInactive === 'true';
    return await this.rolesPermissionsService.findAllPermissions(include);
  }

  @Get('permissions/:id')
  async findPermissionById(@Param('id') id: string) {
    return await this.rolesPermissionsService.findPermissionById(id);
  }

  @Put('permissions/:id')
  async updatePermission(@Param('id') id: string, @Body() updatePermissionDto: UpdatePermissionDto) {
    return await this.rolesPermissionsService.updatePermission(id, updatePermissionDto);
  }

  @Delete('permissions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deletePermission(@Param('id') id: string) {
    await this.rolesPermissionsService.deletePermission(id);
  }

  // Assign role to account
  @Post('assign-role')
  @HttpCode(HttpStatus.OK)
  async assignRoleToAccount(@Body() assignRoleDto: AssignRoleDto) {
    return await this.rolesPermissionsService.assignRoleToAccount(assignRoleDto);
  }

  // Get user permissions
  @Get('user/:accountId/permissions')
  async getUserPermissions(@Param('accountId') accountId: string) {
    const permissions = await this.rolesPermissionsService.getUserPermissions(accountId);
    return { permissions };
  }

  // Check permission
  @Get('user/:accountId/has-permission/:permissionName')
  async hasPermission(
    @Param('accountId') accountId: string,
    @Param('permissionName') permissionName: string,
  ) {
    const hasPermission = await this.rolesPermissionsService.hasPermission(accountId, permissionName);
    return { hasPermission };
  }

}

