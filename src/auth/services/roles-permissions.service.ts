/* eslint-disable prettier/prettier */
import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { RoleEntity } from '../entities/role.entity';
import { PermissionEntity } from '../entities/permission.entity';
import { AccountsEntity } from '../entities/accounts.entity';
import { CreateRoleDto } from '../dtos/create-role.dto';
import { UpdateRoleDto } from '../dtos/update-role.dto';
import { CreatePermissionDto } from '../dtos/create-permission.dto';
import { UpdatePermissionDto } from '../dtos/update-permission.dto';
import { AssignRoleDto } from '../dtos/assign-role.dto';

@Injectable()
export class RolesPermissionsService {
  constructor(
    @InjectRepository(RoleEntity)
    private roleRepository: Repository<RoleEntity>,
    @InjectRepository(PermissionEntity)
    private permissionRepository: Repository<PermissionEntity>,
    @InjectRepository(AccountsEntity)
    private accountsRepository: Repository<AccountsEntity>,
  ) {}

  // Role CRUD Operations
  async createRole(createRoleDto: CreateRoleDto): Promise<RoleEntity> {
    // Check if role with same name already exists
    const existingRole = await this.roleRepository.findOne({
      where: { name: createRoleDto.name },
    });
    if (existingRole) {
      throw new ConflictException(`Role with name "${createRoleDto.name}" already exists`);
    }

    const role = this.roleRepository.create({
      name: createRoleDto.name,
      description: createRoleDto.description,
      active: createRoleDto.active !== undefined ? createRoleDto.active : true,
      isSystemRole: false,
    });

    if (createRoleDto.permissionIds && createRoleDto.permissionIds.length > 0) {
      const permissions = await this.permissionRepository.findBy({
        id: In(createRoleDto.permissionIds),
      });
      role.permissions = permissions;
    }

    return await this.roleRepository.save(role);
  }

  async findAllRoles(includeInactive = false): Promise<RoleEntity[]> {
    const where: any = {};
    if (!includeInactive) {
      where.active = true;
    }
    return await this.roleRepository.find({
      where,
      relations: ['permissions'],
      order: { name: 'ASC' },
    });
  }

  async findRoleById(id: string): Promise<RoleEntity> {
    const role = await this.roleRepository.findOne({
      where: { id },
      relations: ['permissions', 'accounts'],
    });
    if (!role) {
      throw new NotFoundException(`Role with ID "${id}" not found`);
    }
    return role;
  }

  async updateRole(id: string, updateRoleDto: UpdateRoleDto): Promise<RoleEntity> {
    const role = await this.findRoleById(id);

    if (role.isSystemRole && (updateRoleDto.name || updateRoleDto.active === false)) {
      throw new BadRequestException('Cannot modify system roles');
    }

    // Check if name is being changed and if it conflicts with existing role
    if (updateRoleDto.name && updateRoleDto.name !== role.name) {
      const existingRole = await this.roleRepository.findOne({
        where: { name: updateRoleDto.name },
      });
      if (existingRole) {
        throw new ConflictException(`Role with name "${updateRoleDto.name}" already exists`);
      }
      role.name = updateRoleDto.name;
    }

    if (updateRoleDto.description !== undefined) {
      role.description = updateRoleDto.description;
    }
    if (updateRoleDto.active !== undefined && !role.isSystemRole) {
      role.active = updateRoleDto.active;
    }

    if (updateRoleDto.permissionIds !== undefined) {
      const permissions = await this.permissionRepository.findBy({
        id: In(updateRoleDto.permissionIds),
      });
      role.permissions = permissions;
    }

    return await this.roleRepository.save(role);
  }

  async deleteRole(id: string): Promise<void> {
    const role = await this.findRoleById(id);

    if (role.isSystemRole) {
      throw new BadRequestException('Cannot delete system roles');
    }

    // Check if role is assigned to any accounts
    const accountsCount = await this.accountsRepository.count({
      where: { roleId: id },
    });
    if (accountsCount > 0) {
      throw new BadRequestException(`Cannot delete role. It is assigned to ${accountsCount} account(s)`);
    }

    await this.roleRepository.remove(role);
  }

  // Permission CRUD Operations
  async createPermission(createPermissionDto: CreatePermissionDto): Promise<PermissionEntity> {
    // Check if permission with same name already exists
    const existingPermission = await this.permissionRepository.findOne({
      where: { name: createPermissionDto.name },
    });
    if (existingPermission) {
      throw new ConflictException(`Permission with name "${createPermissionDto.name}" already exists`);
    }

    const permission = this.permissionRepository.create({
      name: createPermissionDto.name,
      description: createPermissionDto.description,
      resource: createPermissionDto.resource,
      action: createPermissionDto.action,
      active: createPermissionDto.active !== undefined ? createPermissionDto.active : true,
    });

    return await this.permissionRepository.save(permission);
  }

  async findAllPermissions(includeInactive = false): Promise<PermissionEntity[]> {
    const where: any = {};
    if (!includeInactive) {
      where.active = true;
    }
    return await this.permissionRepository.find({
      where,
      order: { resource: 'ASC', name: 'ASC' },
    });
  }

  async findPermissionById(id: string): Promise<PermissionEntity> {
    const permission = await this.permissionRepository.findOne({
      where: { id },
      relations: ['roles'],
    });
    if (!permission) {
      throw new NotFoundException(`Permission with ID "${id}" not found`);
    }
    return permission;
  }

  async updatePermission(id: string, updatePermissionDto: UpdatePermissionDto): Promise<PermissionEntity> {
    const permission = await this.findPermissionById(id);

    // Check if name is being changed and if it conflicts with existing permission
    if (updatePermissionDto.name && updatePermissionDto.name !== permission.name) {
      const existingPermission = await this.permissionRepository.findOne({
        where: { name: updatePermissionDto.name },
      });
      if (existingPermission) {
        throw new ConflictException(`Permission with name "${updatePermissionDto.name}" already exists`);
      }
      permission.name = updatePermissionDto.name;
    }

    if (updatePermissionDto.description !== undefined) {
      permission.description = updatePermissionDto.description;
    }
    if (updatePermissionDto.resource !== undefined) {
      permission.resource = updatePermissionDto.resource;
    }
    if (updatePermissionDto.action !== undefined) {
      permission.action = updatePermissionDto.action;
    }
    if (updatePermissionDto.active !== undefined) {
      permission.active = updatePermissionDto.active;
    }

    return await this.permissionRepository.save(permission);
  }

  async deletePermission(id: string): Promise<void> {
    const permission = await this.findPermissionById(id);

    // Check if permission is assigned to any roles
    if (permission.roles && permission.roles.length > 0) {
      throw new BadRequestException(`Cannot delete permission. It is assigned to ${permission.roles.length} role(s)`);
    }

    await this.permissionRepository.remove(permission);
  }

  // Assign role to account
  async assignRoleToAccount(assignRoleDto: AssignRoleDto): Promise<AccountsEntity> {
    const account = await this.accountsRepository.findOne({
      where: { id: assignRoleDto.accountId },
    });
    if (!account) {
      throw new NotFoundException(`Account with ID "${assignRoleDto.accountId}" not found`);
    }

    const role = await this.findRoleById(assignRoleDto.roleId);
    if (!role.active) {
      throw new BadRequestException('Cannot assign inactive role');
    }

    account.roleId = role.id;
    account.roleEntity = role;

    return await this.accountsRepository.save(account);
  }

  // Get user permissions
  async getUserPermissions(accountId: string): Promise<string[]> {
    const account = await this.accountsRepository.findOne({
      where: { id: accountId },
      relations: ['roleEntity', 'roleEntity.permissions'],
    });

    if (!account || !account.roleEntity || !account.roleEntity.permissions) {
      return [];
    }

    return account.roleEntity.permissions
      .filter((p) => p.active)
      .map((p) => p.name);
  }

  // Check if user has permission
  async hasPermission(accountId: string, permissionName: string): Promise<boolean> {
    const permissions = await this.getUserPermissions(accountId);
    return permissions.includes(permissionName);
  }
}

