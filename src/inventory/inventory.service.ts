import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { RolesPermissionsService } from 'src/auth/services/roles-permissions.service';
import { PERMISSIONS } from 'src/auth/models/permissions.constants';
import { ROLES } from 'src/auth/models/roles.enum';
import { TeachersEntity } from 'src/profiles/entities/teachers.entity';
import { RoomEntity } from './entities/room.entity';
import { InventoryItemEntity } from './entities/inventory-item.entity';
import { InventoryAdjustmentEntity } from './entities/inventory-adjustment.entity';
import { CreateRoomDto } from './dtos/create-room.dto';
import { UpdateRoomDto } from './dtos/update-room.dto';
import { CreateInventoryItemDto } from './dtos/create-inventory-item.dto';
import { UpdateInventoryItemDto } from './dtos/update-inventory-item.dto';
import { AdjustInventoryDto } from './dtos/adjust-inventory.dto';
import { StocktakeInventoryDto } from './dtos/stocktake-inventory.dto';
import { InventoryAdjustmentReason } from './models/inventory-adjustment-reason.enum';
import { TransferInventoryDto } from './dtos/transfer-inventory.dto';
import { BulkCreateInventoryItemsDto } from './dtos/bulk-create-items.dto';
import { ReceiveRequisitionDto } from './dtos/receive-requisition.dto';
import { RequisitionEntity } from 'src/requisitions/entities/requisition.entity';
import { RequisitionItemEntity } from 'src/requisitions/entities/requisition-item.entity';
import { RequisitionStatus } from 'src/requisitions/models/requisition-status.enum';

type AuthProfile = TeachersEntity & { role: ROLES; accountId?: string };

type PaginatedResult<T> = {
  items: T[];
  total: number;
  page: number;
  limit: number;
};

function parsePageLimit(pageRaw: unknown, limitRaw: unknown) {
  const page =
    typeof pageRaw === 'string' ? parseInt(pageRaw, 10) : Number(pageRaw);
  const limit =
    typeof limitRaw === 'string' ? parseInt(limitRaw, 10) : Number(limitRaw);

  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  const safeLimitCandidate =
    Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 50;
  const safeLimit = Math.min(Math.max(safeLimitCandidate, 1), 200);

  return { page: safePage, limit: safeLimit, skip: (safePage - 1) * safeLimit };
}

@Injectable()
export class InventoryService {
  constructor(
    @InjectRepository(RoomEntity)
    private readonly roomsRepository: Repository<RoomEntity>,
    @InjectRepository(InventoryItemEntity)
    private readonly inventoryItemsRepository: Repository<InventoryItemEntity>,
    @InjectRepository(InventoryAdjustmentEntity)
    private readonly inventoryAdjustmentsRepository: Repository<InventoryAdjustmentEntity>,
    @InjectRepository(TeachersEntity)
    private readonly teachersRepository: Repository<TeachersEntity>,
    @InjectRepository(RequisitionEntity)
    private readonly requisitionsRepository: Repository<RequisitionEntity>,
    @InjectRepository(RequisitionItemEntity)
    private readonly requisitionItemsRepository: Repository<RequisitionItemEntity>,
    private readonly rolesPermissionsService: RolesPermissionsService,
  ) {}

  private ensureTeacherProfile(profile: AuthProfile): void {
    const allowedTeacherRoles = [
      ROLES.teacher,
      ROLES.hod,
      ROLES.seniorTeacher,
      ROLES.deputy,
      ROLES.head,
      ROLES.director,
      ROLES.auditor,
      ROLES.admin,
      ROLES.dev,
    ];
    if (!profile?.id || !profile?.role || !allowedTeacherRoles.includes(profile.role)) {
      throw new ForbiddenException('Not allowed to access inventory');
    }
  }

  private async ensureHasViewPermission(profile: AuthProfile): Promise<void> {
    this.ensureTeacherProfile(profile);
    const accountId = profile.accountId;
    if (!accountId) {
      throw new ForbiddenException('User account ID not found');
    }

    const canViewAll = await this.rolesPermissionsService.hasPermission(
      accountId,
      PERMISSIONS.INVENTORY.VIEW_ALL,
    );
    const canViewOwn = await this.rolesPermissionsService.hasPermission(
      accountId,
      PERMISSIONS.INVENTORY.VIEW_OWN_DEPARTMENT,
    );

    if (!canViewAll && !canViewOwn) {
      throw new ForbiddenException('Missing required inventory view permission');
    }
  }

  private async getViewScope(profile: AuthProfile): Promise<{
    canViewAll: boolean;
    canViewOwn: boolean;
    departmentId: string | null;
    accountId: string;
  }> {
    this.ensureTeacherProfile(profile);
    const accountId = profile.accountId;
    if (!accountId) {
      throw new ForbiddenException('User account ID not found');
    }

    const [canViewAll, canViewOwn] = await Promise.all([
      this.rolesPermissionsService.hasPermission(
        accountId,
        PERMISSIONS.INVENTORY.VIEW_ALL,
      ),
      this.rolesPermissionsService.hasPermission(
        accountId,
        PERMISSIONS.INVENTORY.VIEW_OWN_DEPARTMENT,
      ),
    ]);

    if (!canViewAll && !canViewOwn) {
      throw new ForbiddenException('Missing required inventory view permission');
    }

    const teacher = await this.teachersRepository.findOne({
      where: { id: profile.id },
    });

    return {
      canViewAll,
      canViewOwn,
      departmentId: teacher?.departmentId ?? null,
      accountId,
    };
  }

  private async ensureCanManageOwnDepartment(
    profile: AuthProfile,
  ): Promise<{ teacher: TeachersEntity; departmentId: string }> {
    this.ensureTeacherProfile(profile);
    const accountId = profile.accountId;
    if (!accountId) {
      throw new ForbiddenException('User account ID not found');
    }

    const canManage = await this.rolesPermissionsService.hasPermission(
      accountId,
      PERMISSIONS.INVENTORY.MANAGE_OWN_DEPARTMENT,
    );

    if (!canManage) {
      throw new ForbiddenException('Missing required inventory manage permission');
    }

    const teacher = await this.teachersRepository.findOne({
      where: { id: profile.id },
    });

    if (!teacher) {
      throw new BadRequestException('Teacher profile not found');
    }

    if (!teacher.departmentId) {
      throw new BadRequestException(
        'Teacher is not assigned to a department. Please update their department first.',
      );
    }

    return { teacher, departmentId: teacher.departmentId };
  }

  async getRooms(
    profile: AuthProfile,
    params: { page?: unknown; limit?: unknown; departmentId?: string; q?: string; isActive?: string },
  ): Promise<PaginatedResult<RoomEntity>> {
    const { canViewAll, departmentId: ownDepartmentId } =
      await this.getViewScope(profile);
    const { page, limit, skip } = parsePageLimit(params.page, params.limit);

    const qb = this.roomsRepository
      .createQueryBuilder('room')
      .leftJoinAndSelect('room.department', 'department')
      .orderBy('room.name', 'ASC')
      .take(limit)
      .skip(skip);

    const query = (params.q || '').toString().trim();
    if (query) {
      qb.andWhere('room.name ILIKE :q OR room.code ILIKE :q', { q: `%${query}%` });
    }

    const isActiveFilter = (params.isActive || '').toString().trim().toLowerCase();
    if (isActiveFilter === 'true') {
      qb.andWhere('room.isActive = true');
    } else if (isActiveFilter === 'false') {
      qb.andWhere('room.isActive = false');
    }

    if (canViewAll) {
      const deptIdFilter = params.departmentId?.trim();
      if (deptIdFilter) {
        qb.andWhere('room.departmentId = :deptId', { deptId: deptIdFilter });
      }
    } else {
      if (!ownDepartmentId) {
        throw new ForbiddenException('No department assigned');
      }
      qb.andWhere('room.departmentId = :deptId', { deptId: ownDepartmentId });
    }

    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, limit };
  }

  async createRoom(profile: AuthProfile, dto: CreateRoomDto): Promise<RoomEntity> {
    const { departmentId } = await this.ensureCanManageOwnDepartment(profile);

    const room = this.roomsRepository.create({
      departmentId,
      name: dto.name.trim(),
      code: dto.code?.trim() || null,
      description: dto.description?.trim() || null,
      isActive: true,
    });

    return this.roomsRepository.save(room);
  }

  async updateRoom(
    profile: AuthProfile,
    roomId: string,
    dto: UpdateRoomDto,
  ): Promise<RoomEntity> {
    const { departmentId } = await this.ensureCanManageOwnDepartment(profile);

    const room = await this.roomsRepository.findOne({ where: { id: roomId } });
    if (!room) throw new NotFoundException('Room not found');
    if (room.departmentId !== departmentId) {
      throw new ForbiddenException('Not allowed to update another department room');
    }

    if (dto.name !== undefined) {
      room.name = dto.name.trim();
    }
    if (dto.code !== undefined) {
      room.code = dto.code === null ? null : dto.code?.trim() || null;
    }
    if (dto.description !== undefined) {
      room.description =
        dto.description === null ? null : dto.description?.trim() || null;
    }
    if (dto.isActive !== undefined) {
      room.isActive = Boolean(dto.isActive);
    }

    return this.roomsRepository.save(room);
  }

  async getRoomSummary(profile: AuthProfile, roomId: string): Promise<{
    roomId: string;
    itemCount: number;
    totalQuantityOnHand: number;
    lowStockCount: number;
  }> {
    await this.ensureHasViewPermission(profile);
    const { canViewAll, departmentId: ownDepartmentId } =
      await this.getViewScope(profile);

    const room = await this.roomsRepository.findOne({ where: { id: roomId } });
    if (!room) throw new NotFoundException('Room not found');

    if (!canViewAll) {
      if (!ownDepartmentId || room.departmentId !== ownDepartmentId) {
        throw new ForbiddenException('Not allowed to view this room');
      }
    }

    const itemCount = await this.inventoryItemsRepository.count({
      where: { roomId, isActive: true },
    });

    const totalsRaw = await this.inventoryItemsRepository
      .createQueryBuilder('item')
      .select('COALESCE(SUM(item.quantityOnHand), 0)', 'totalQuantity')
      .addSelect(
        `COALESCE(SUM(CASE WHEN item.reorderLevel IS NOT NULL AND item.quantityOnHand <= item.reorderLevel THEN 1 ELSE 0 END), 0)`,
        'lowStockCount',
      )
      .where('item.roomId = :roomId', { roomId })
      .andWhere('item.isActive = true')
      .getRawOne<{ totalQuantity: string | number; lowStockCount: string | number }>();

    const totalQuantityOnHand =
      typeof totalsRaw.totalQuantity === 'string'
        ? parseInt(totalsRaw.totalQuantity, 10) || 0
        : (totalsRaw.totalQuantity as number) || 0;

    const lowStockCount =
      typeof totalsRaw.lowStockCount === 'string'
        ? parseInt(totalsRaw.lowStockCount, 10) || 0
        : (totalsRaw.lowStockCount as number) || 0;

    return { roomId, itemCount, totalQuantityOnHand, lowStockCount };
  }

  async getItems(
    profile: AuthProfile,
    params: {
      page?: unknown;
      limit?: unknown;
      departmentId?: string;
      roomId?: string;
      q?: string;
      category?: string;
      belowReorder?: string;
      isActive?: string;
    },
  ): Promise<PaginatedResult<InventoryItemEntity>> {
    const { canViewAll, departmentId: ownDepartmentId } =
      await this.getViewScope(profile);
    const { page, limit, skip } = parsePageLimit(params.page, params.limit);

    const qb = this.inventoryItemsRepository
      .createQueryBuilder('item')
      .leftJoinAndSelect('item.room', 'room')
      .leftJoinAndSelect('room.department', 'department')
      .orderBy('item.name', 'ASC')
      .take(limit)
      .skip(skip);

    const isActiveFilter = (params.isActive || '').toString().trim().toLowerCase();
    if (isActiveFilter === 'true') {
      qb.andWhere('item.isActive = true');
    } else if (isActiveFilter === 'false') {
      qb.andWhere('item.isActive = false');
    } else {
      qb.andWhere('item.isActive = true');
    }

    if (params.roomId?.trim()) {
      qb.andWhere('item.roomId = :roomId', { roomId: params.roomId.trim() });
    }

    const category = (params.category || '').toString().trim();
    if (category) {
      qb.andWhere('item.category = :category', { category });
    }

    const query = (params.q || '').toString().trim();
    if (query) {
      qb.andWhere(
        new Brackets((whereQb) => {
          whereQb
            .where('item.name ILIKE :q', { q: `%${query}%` })
            .orWhere('item.category ILIKE :q', { q: `%${query}%` })
            .orWhere('room.name ILIKE :q', { q: `%${query}%` })
            .orWhere('room.code ILIKE :q', { q: `%${query}%` });
        }),
      );
    }

    const belowReorder = (params.belowReorder || '').toString().trim().toLowerCase();
    if (belowReorder === 'true') {
      qb.andWhere('item.reorderLevel IS NOT NULL')
        .andWhere('item.quantityOnHand <= item.reorderLevel');
    }

    if (canViewAll) {
      const deptIdFilter = params.departmentId?.trim();
      if (deptIdFilter) {
        qb.andWhere('item.departmentId = :deptId', { deptId: deptIdFilter });
      }
    } else {
      if (!ownDepartmentId) {
        throw new ForbiddenException('No department assigned');
      }
      qb.andWhere('item.departmentId = :deptId', { deptId: ownDepartmentId });
    }

    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, limit };
  }

  async createItem(
    profile: AuthProfile,
    dto: CreateInventoryItemDto,
  ): Promise<InventoryItemEntity> {
    const { departmentId } = await this.ensureCanManageOwnDepartment(profile);

    const room = await this.roomsRepository.findOne({ where: { id: dto.roomId } });
    if (!room) throw new NotFoundException('Room not found');
    if (room.departmentId !== departmentId) {
      throw new ForbiddenException('Room is not in your department');
    }

    const item = this.inventoryItemsRepository.create({
      departmentId,
      roomId: room.id,
      name: dto.name.trim(),
      category: dto.category?.trim() || null,
      unit: dto.unit?.trim() || null,
      quantityOnHand: dto.quantityOnHand ?? 0,
      reorderLevel: dto.reorderLevel ?? null,
      notes: dto.notes ?? null,
      isActive: true,
    });

    return this.inventoryItemsRepository.save(item);
  }

  async bulkCreateItems(
    profile: AuthProfile,
    dto: BulkCreateInventoryItemsDto,
  ): Promise<{ created: number }> {
    const { departmentId } = await this.ensureCanManageOwnDepartment(profile);

    const room = await this.roomsRepository.findOne({ where: { id: dto.roomId } });
    if (!room) throw new NotFoundException('Room not found');
    if (room.departmentId !== departmentId) {
      throw new ForbiddenException('Room is not in your department');
    }

    const rows = dto.items ?? [];
    if (!rows.length) {
      throw new BadRequestException('items is required');
    }

    // Normalize and filter out empty rows.
    const normalized = rows
      .map((r) => ({
        name: (r.name || '').trim(),
        category: r.category?.trim() || null,
        unit: r.unit?.trim() || null,
        quantityOnHand: r.quantityOnHand ?? 0,
        reorderLevel: r.reorderLevel ?? null,
        notes: r.notes ?? null,
      }))
      .filter((r) => Boolean(r.name));

    if (!normalized.length) {
      throw new BadRequestException('No valid items found');
    }

    return this.inventoryItemsRepository.manager.transaction(async (manager) => {
      const itemRepo = manager.getRepository(InventoryItemEntity);

      // Avoid failing the whole batch due to duplicates: create only those that don't exist.
      const existing = await itemRepo.find({
        where: { roomId: room.id },
        select: ['id', 'name'],
      });
      const existingNames = new Set(existing.map((e) => e.name.toLowerCase()));

      const toCreate = normalized.filter(
        (r) => !existingNames.has(r.name.toLowerCase()),
      );

      const entities = toCreate.map((r) =>
        itemRepo.create({
          departmentId,
          roomId: room.id,
          name: r.name,
          category: r.category,
          unit: r.unit,
          quantityOnHand: r.quantityOnHand,
          reorderLevel: r.reorderLevel,
          notes: r.notes,
          isActive: true,
        }),
      );

      if (!entities.length) {
        return { created: 0 };
      }

      await itemRepo.save(entities);
      return { created: entities.length };
    });
  }

  async updateItem(
    profile: AuthProfile,
    itemId: string,
    dto: UpdateInventoryItemDto,
  ): Promise<InventoryItemEntity> {
    const { departmentId } = await this.ensureCanManageOwnDepartment(profile);

    const item = await this.inventoryItemsRepository.findOne({ where: { id: itemId } });
    if (!item) throw new NotFoundException('Item not found');
    if (item.departmentId !== departmentId) {
      throw new ForbiddenException('Not allowed to update another department item');
    }

    if (dto.name !== undefined) {
      item.name = dto.name.trim();
    }
    if (dto.category !== undefined) {
      item.category = dto.category === null ? null : dto.category?.trim() || null;
    }
    if (dto.unit !== undefined) {
      item.unit = dto.unit === null ? null : dto.unit?.trim() || null;
    }
    if (dto.reorderLevel !== undefined) {
      item.reorderLevel = dto.reorderLevel === null ? null : dto.reorderLevel;
    }
    if (dto.notes !== undefined) {
      item.notes = dto.notes === null ? null : dto.notes;
    }
    if (dto.isActive !== undefined) {
      item.isActive = Boolean(dto.isActive);
    }

    return this.inventoryItemsRepository.save(item);
  }

  async adjustItemQuantity(
    profile: AuthProfile,
    itemId: string,
    dto: AdjustInventoryDto,
  ): Promise<InventoryItemEntity> {
    const { teacher, departmentId } =
      await this.ensureCanManageOwnDepartment(profile);

    if (!dto.delta || dto.delta === 0) {
      throw new BadRequestException('delta must be non-zero');
    }

    return this.inventoryItemsRepository.manager.transaction(async (manager) => {
      const itemRepo = manager.getRepository(InventoryItemEntity);
      const adjustmentRepo = manager.getRepository(InventoryAdjustmentEntity);

      const item = await itemRepo.findOne({ where: { id: itemId } });
      if (!item) throw new NotFoundException('Item not found');
      if (item.departmentId !== departmentId) {
        throw new ForbiddenException('Not allowed to adjust another department item');
      }
      if (!item.isActive) {
        throw new BadRequestException('Cannot adjust an inactive item');
      }

      const newQuantity = item.quantityOnHand + dto.delta;
      if (newQuantity < 0) {
        throw new BadRequestException('Quantity cannot be negative');
      }

      const adjustment = adjustmentRepo.create({
        inventoryItemId: item.id,
        delta: dto.delta,
        reason: dto.reason,
        reference: dto.reference ?? null,
        notes: dto.notes ?? null,
        createdByTeacherId: teacher.id,
      });

      await adjustmentRepo.save(adjustment);

      item.quantityOnHand = newQuantity;
      await itemRepo.save(item);

      return item;
    });
  }

  async stocktakeItem(
    profile: AuthProfile,
    itemId: string,
    dto: StocktakeInventoryDto,
  ): Promise<InventoryItemEntity> {
    const { teacher, departmentId } =
      await this.ensureCanManageOwnDepartment(profile);

    const counted = Number(dto.quantityOnHand);
    if (!Number.isFinite(counted) || counted < 0) {
      throw new BadRequestException('quantityOnHand must be a non-negative number');
    }

    return this.inventoryItemsRepository.manager.transaction(async (manager) => {
      const itemRepo = manager.getRepository(InventoryItemEntity);
      const adjustmentRepo = manager.getRepository(InventoryAdjustmentEntity);

      const item = await itemRepo.findOne({ where: { id: itemId } });
      if (!item) throw new NotFoundException('Item not found');
      if (item.departmentId !== departmentId) {
        throw new ForbiddenException('Not allowed to stocktake another department item');
      }
      if (!item.isActive) {
        throw new BadRequestException('Cannot stocktake an inactive item');
      }

      const delta = counted - item.quantityOnHand;
      if (delta === 0) {
        return item;
      }

      const adjustment = adjustmentRepo.create({
        inventoryItemId: item.id,
        delta,
        reason: InventoryAdjustmentReason.Stocktake,
        reference: dto.reference ?? null,
        notes: dto.notes ?? null,
        createdByTeacherId: teacher.id,
      });

      await adjustmentRepo.save(adjustment);

      item.quantityOnHand = counted;
      await itemRepo.save(item);

      return item;
    });
  }

  async getItemAdjustments(
    profile: AuthProfile,
    itemId: string,
    params: { page?: unknown; limit?: unknown },
  ): Promise<PaginatedResult<InventoryAdjustmentEntity>> {
    await this.ensureHasViewPermission(profile);
    const { canViewAll, departmentId: ownDepartmentId } =
      await this.getViewScope(profile);
    const { page, limit, skip } = parsePageLimit(params.page, params.limit);

    const item = await this.inventoryItemsRepository.findOne({
      where: { id: itemId },
    });
    if (!item) throw new NotFoundException('Item not found');

    if (!canViewAll) {
      if (!ownDepartmentId || item.departmentId !== ownDepartmentId) {
        throw new ForbiddenException('Not allowed to view this item');
      }
    }

    const qb = this.inventoryAdjustmentsRepository
      .createQueryBuilder('adj')
      .leftJoinAndSelect('adj.createdBy', 'createdBy')
      .where('adj.inventoryItemId = :itemId', { itemId })
      .orderBy('adj.createdAt', 'DESC')
      .take(limit)
      .skip(skip);

    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, limit };
  }

  async transferStock(
    profile: AuthProfile,
    dto: TransferInventoryDto,
  ): Promise<{
    fromItem: InventoryItemEntity;
    toItem: InventoryItemEntity;
  }> {
    const { teacher, departmentId } =
      await this.ensureCanManageOwnDepartment(profile);

    const quantity = Number(dto.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new BadRequestException('quantity must be a positive number');
    }

    return this.inventoryItemsRepository.manager.transaction(async (manager) => {
      const itemRepo = manager.getRepository(InventoryItemEntity);
      const roomRepo = manager.getRepository(RoomEntity);
      const adjustmentRepo = manager.getRepository(InventoryAdjustmentEntity);

      const fromItem = await itemRepo.findOne({ where: { id: dto.fromItemId } });
      if (!fromItem) throw new NotFoundException('Source item not found');
      if (fromItem.departmentId !== departmentId) {
        throw new ForbiddenException('Not allowed to transfer another department item');
      }
      if (!fromItem.isActive) {
        throw new BadRequestException('Cannot transfer an inactive item');
      }
      if (fromItem.quantityOnHand < quantity) {
        throw new BadRequestException('Insufficient quantity on hand');
      }

      const toRoom = await roomRepo.findOne({ where: { id: dto.toRoomId } });
      if (!toRoom) throw new NotFoundException('Destination room not found');
      if (!toRoom.isActive) {
        throw new BadRequestException('Destination room is inactive');
      }
      if (toRoom.departmentId !== departmentId) {
        throw new ForbiddenException('Can only transfer within your department');
      }

      if (toRoom.id === fromItem.roomId) {
        throw new BadRequestException('Destination room must be different to source room');
      }

      // Try to find destination item with same name in that room; if not, create it.
      let toItem = await itemRepo.findOne({
        where: { roomId: toRoom.id, name: fromItem.name },
      });

      if (!toItem) {
        toItem = itemRepo.create({
          departmentId,
          roomId: toRoom.id,
          name: fromItem.name,
          category: fromItem.category ?? null,
          unit: fromItem.unit ?? null,
          reorderLevel: fromItem.reorderLevel ?? null,
          notes: fromItem.notes ?? null,
          quantityOnHand: 0,
          isActive: true,
        });
        toItem = await itemRepo.save(toItem);
      } else {
        if (toItem.departmentId !== departmentId) {
          throw new BadRequestException('Destination item department mismatch');
        }
        if (!toItem.isActive) {
          throw new BadRequestException('Destination item is inactive');
        }
      }

      // Create audit entries then apply stock updates.
      const reference = dto.reference ?? null;
      const notes = dto.notes ?? null;

      const outAdj = adjustmentRepo.create({
        inventoryItemId: fromItem.id,
        delta: -quantity,
        reason: InventoryAdjustmentReason.TransferOut,
        reference,
        notes,
        createdByTeacherId: teacher.id,
      });
      const inAdj = adjustmentRepo.create({
        inventoryItemId: toItem.id,
        delta: quantity,
        reason: InventoryAdjustmentReason.TransferIn,
        reference,
        notes,
        createdByTeacherId: teacher.id,
      });

      await adjustmentRepo.save([outAdj, inAdj]);

      fromItem.quantityOnHand = fromItem.quantityOnHand - quantity;
      toItem.quantityOnHand = toItem.quantityOnHand + quantity;

      const saved = await itemRepo.save([fromItem, toItem]);

      return {
        fromItem: saved.find((x) => x.id === fromItem.id)!,
        toItem: saved.find((x) => x.id === toItem.id)!,
      };
    });
  }

  async receiveFromRequisition(
    profile: AuthProfile,
    dto: ReceiveRequisitionDto,
  ): Promise<{ requisitionId: string; receivedLines: number }> {
    const { teacher, departmentId } =
      await this.ensureCanManageOwnDepartment(profile);

    const room = await this.roomsRepository.findOne({ where: { id: dto.roomId } });
    if (!room) throw new NotFoundException('Room not found');
    if (!room.isActive) throw new BadRequestException('Room is inactive');
    if (room.departmentId !== departmentId) {
      throw new ForbiddenException('Room is not in your department');
    }

    const lines = dto.lines ?? [];
    if (!lines.length) {
      throw new BadRequestException('lines is required');
    }

    const lineMap = new Map<string, number>();
    for (const line of lines) {
      const qty = Number(line.quantityReceived);
      if (!Number.isFinite(qty) || qty <= 0) {
        throw new BadRequestException('quantityReceived must be a positive number');
      }
      lineMap.set(line.requisitionItemId, qty);
    }

    const reference = `REQ:${dto.requisitionId}`;
    const notes = dto.notes ?? null;

    const receivedLines = await this.inventoryItemsRepository.manager.transaction(async (manager) => {
      const itemRepo = manager.getRepository(InventoryItemEntity);
      const adjustmentRepo = manager.getRepository(InventoryAdjustmentEntity);
      const reqRepo = manager.getRepository(RequisitionEntity);
      const reqItemRepo = manager.getRepository(RequisitionItemEntity);

      const requisition = await reqRepo.findOne({
        where: { id: dto.requisitionId },
        relations: ['department', 'items'],
      });
      if (!requisition) throw new NotFoundException('Requisition not found');

      if (requisition.status !== RequisitionStatus.Authorized) {
        throw new BadRequestException(
          `Only authorised requisitions can be received. Current status: "${requisition.status}"`,
        );
      }

      const reqDeptId = (requisition.department as any)?.id;
      if (!reqDeptId || reqDeptId !== departmentId) {
        throw new ForbiddenException(
          'Can only receive requisitions for your department',
        );
      }

      const reqItems = requisition.items ?? [];

      let appliedLines = 0;
      for (const reqItem of reqItems) {
        const qtyReceived = lineMap.get(reqItem.id);
        if (!qtyReceived) continue;

        const ordered = Number(reqItem.quantity);
        const alreadyReceived = Number((reqItem as any).receivedQuantity ?? 0);
        const remaining = ordered - alreadyReceived;
        if (remaining <= 0) continue;
        if (qtyReceived > remaining) {
          throw new BadRequestException(
            `Cannot receive more than remaining for item "${reqItem.description}". Remaining: ${remaining}`,
          );
        }

        // Find or create inventory item in the destination room, by matching name.
        const itemName = (reqItem.description || '').trim();
        if (!itemName) {
          throw new BadRequestException('Requisition item description is required');
        }

        let invItem = await itemRepo.findOne({
          where: { roomId: room.id, name: itemName },
        });

        if (!invItem) {
          invItem = itemRepo.create({
            departmentId,
            roomId: room.id,
            name: itemName,
            category: 'Requisition',
            unit: null,
            quantityOnHand: 0,
            reorderLevel: null,
            notes: null,
            isActive: true,
          });
          invItem = await itemRepo.save(invItem);
        }

        const adj = adjustmentRepo.create({
          inventoryItemId: invItem.id,
          delta: qtyReceived,
          reason: InventoryAdjustmentReason.Received,
          reference,
          notes,
          createdByTeacherId: teacher.id,
        });
        await adjustmentRepo.save(adj);

        invItem.quantityOnHand = invItem.quantityOnHand + qtyReceived;
        await itemRepo.save(invItem);

        (reqItem as any).receivedQuantity = alreadyReceived + qtyReceived;
        await reqItemRepo.save(reqItem);

        appliedLines += 1;
      }

      // Mark requisition received if fully received.
      const refreshedItems = await reqItemRepo.find({
        where: { requisition: { id: requisition.id } as any },
      });
      const fullyReceived =
        refreshedItems.length > 0 &&
        refreshedItems.every((ri) => {
          const ordered = Number((ri as any).quantity ?? 0);
          const rec = Number((ri as any).receivedQuantity ?? 0);
          return rec >= ordered;
        });

      if (fullyReceived) {
        requisition.receivedAt = new Date();
        requisition.receivedById = teacher.id;
        requisition.receivedBy = teacher;
        await reqRepo.save(requisition);
      }

      return appliedLines;
    });

    return { requisitionId: dto.requisitionId, receivedLines };
  }
}

