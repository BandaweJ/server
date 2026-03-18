import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PermissionsGuard } from 'src/auth/guards/permissions.guard';
import { HasPermissions } from 'src/auth/decorators/has-permissions.decorator';
import { PERMISSIONS } from 'src/auth/models/permissions.constants';
import { GetUser } from 'src/auth/decorators/get-user.decorator';
import { ROLES } from 'src/auth/models/roles.enum';
import { TeachersEntity } from 'src/profiles/entities/teachers.entity';
import { InventoryService } from './inventory.service';
import { CreateRoomDto } from './dtos/create-room.dto';
import { UpdateRoomDto } from './dtos/update-room.dto';
import { CreateInventoryItemDto } from './dtos/create-inventory-item.dto';
import { UpdateInventoryItemDto } from './dtos/update-inventory-item.dto';
import { AdjustInventoryDto } from './dtos/adjust-inventory.dto';
import { StocktakeInventoryDto } from './dtos/stocktake-inventory.dto';
import { TransferInventoryDto } from './dtos/transfer-inventory.dto';
import { BulkCreateInventoryItemsDto } from './dtos/bulk-create-items.dto';
import { ReceiveRequisitionDto } from './dtos/receive-requisition.dto';

@Controller('inventory')
@UseGuards(AuthGuard())
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  // Rooms
  @Get('rooms')
  getRooms(
    @GetUser() profile: TeachersEntity & { role: ROLES; accountId?: string },
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('departmentId') departmentId?: string,
    @Query('q') q?: string,
    @Query('isActive') isActive?: string,
  ) {
    return this.inventoryService.getRooms(profile, {
      page,
      limit,
      departmentId,
      q,
      isActive,
    });
  }

  @Post('rooms')
  @UseGuards(PermissionsGuard)
  @HasPermissions(PERMISSIONS.INVENTORY.MANAGE_OWN_DEPARTMENT)
  createRoom(
    @GetUser() profile: TeachersEntity & { role: ROLES; accountId?: string },
    @Body() dto: CreateRoomDto,
  ) {
    return this.inventoryService.createRoom(profile, dto);
  }

  @Patch('rooms/:id')
  @UseGuards(PermissionsGuard)
  @HasPermissions(PERMISSIONS.INVENTORY.MANAGE_OWN_DEPARTMENT)
  updateRoom(
    @GetUser() profile: TeachersEntity & { role: ROLES; accountId?: string },
    @Param('id') id: string,
    @Body() dto: UpdateRoomDto,
  ) {
    return this.inventoryService.updateRoom(profile, id, dto);
  }

  @Get('rooms/:id/summary')
  getRoomSummary(
    @GetUser() profile: TeachersEntity & { role: ROLES; accountId?: string },
    @Param('id') id: string,
  ) {
    return this.inventoryService.getRoomSummary(profile, id);
  }

  // Items
  @Get('items')
  getItems(
    @GetUser() profile: TeachersEntity & { role: ROLES; accountId?: string },
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('departmentId') departmentId?: string,
    @Query('roomId') roomId?: string,
    @Query('q') q?: string,
    @Query('category') category?: string,
    @Query('belowReorder') belowReorder?: string,
    @Query('isActive') isActive?: string,
  ) {
    return this.inventoryService.getItems(profile, {
      page,
      limit,
      departmentId,
      roomId,
      q,
      category,
      belowReorder,
      isActive,
    });
  }

  @Post('items')
  @UseGuards(PermissionsGuard)
  @HasPermissions(PERMISSIONS.INVENTORY.MANAGE_OWN_DEPARTMENT)
  createItem(
    @GetUser() profile: TeachersEntity & { role: ROLES; accountId?: string },
    @Body() dto: CreateInventoryItemDto,
  ) {
    return this.inventoryService.createItem(profile, dto);
  }

  @Post('items/bulk')
  @UseGuards(PermissionsGuard)
  @HasPermissions(PERMISSIONS.INVENTORY.MANAGE_OWN_DEPARTMENT)
  bulkCreateItems(
    @GetUser() profile: TeachersEntity & { role: ROLES; accountId?: string },
    @Body() dto: BulkCreateInventoryItemsDto,
  ) {
    return this.inventoryService.bulkCreateItems(profile, dto);
  }

  @Patch('items/:id')
  @UseGuards(PermissionsGuard)
  @HasPermissions(PERMISSIONS.INVENTORY.MANAGE_OWN_DEPARTMENT)
  updateItem(
    @GetUser() profile: TeachersEntity & { role: ROLES; accountId?: string },
    @Param('id') id: string,
    @Body() dto: UpdateInventoryItemDto,
  ) {
    return this.inventoryService.updateItem(profile, id, dto);
  }

  @Post('items/:id/adjust')
  @UseGuards(PermissionsGuard)
  @HasPermissions(PERMISSIONS.INVENTORY.MANAGE_OWN_DEPARTMENT)
  adjustItemQuantity(
    @GetUser() profile: TeachersEntity & { role: ROLES; accountId?: string },
    @Param('id') id: string,
    @Body() dto: AdjustInventoryDto,
  ) {
    return this.inventoryService.adjustItemQuantity(profile, id, dto);
  }

  @Post('items/:id/stocktake')
  @UseGuards(PermissionsGuard)
  @HasPermissions(PERMISSIONS.INVENTORY.MANAGE_OWN_DEPARTMENT)
  stocktakeItem(
    @GetUser() profile: TeachersEntity & { role: ROLES; accountId?: string },
    @Param('id') id: string,
    @Body() dto: StocktakeInventoryDto,
  ) {
    return this.inventoryService.stocktakeItem(profile, id, dto);
  }

  @Get('items/:id/adjustments')
  getItemAdjustments(
    @GetUser() profile: TeachersEntity & { role: ROLES; accountId?: string },
    @Param('id') id: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.inventoryService.getItemAdjustments(profile, id, { page, limit });
  }

  @Post('transfer')
  @UseGuards(PermissionsGuard)
  @HasPermissions(PERMISSIONS.INVENTORY.MANAGE_OWN_DEPARTMENT)
  transfer(
    @GetUser() profile: TeachersEntity & { role: ROLES; accountId?: string },
    @Body() dto: TransferInventoryDto,
  ) {
    return this.inventoryService.transferStock(profile, dto);
  }

  @Post('receive-requisition')
  @UseGuards(PermissionsGuard)
  @HasPermissions(PERMISSIONS.INVENTORY.MANAGE_OWN_DEPARTMENT)
  receiveRequisition(
    @GetUser() profile: TeachersEntity & { role: ROLES; accountId?: string },
    @Body() dto: ReceiveRequisitionDto,
  ) {
    return this.inventoryService.receiveFromRequisition(profile, dto);
  }
}

