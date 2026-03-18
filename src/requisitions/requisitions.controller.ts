import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PermissionsGuard } from 'src/auth/guards/permissions.guard';
import { HasPermissions } from 'src/auth/decorators/has-permissions.decorator';
import { PERMISSIONS } from 'src/auth/models/permissions.constants';
import { GetUser } from 'src/auth/decorators/get-user.decorator';
import { TeachersEntity } from 'src/profiles/entities/teachers.entity';
import { RequisitionsService } from './requisitions.service';
import { CreateRequisitionDto } from './dtos/create-requisition.dto';
import { RejectRequisitionDto } from './dtos/reject-requisition.dto';
import { RequisitionEntity } from './entities/requisition.entity';
import { ROLES } from 'src/auth/models/roles.enum';

@Controller('requisitions')
@UseGuards(AuthGuard(), PermissionsGuard)
export class RequisitionsController {
  constructor(private readonly requisitionsService: RequisitionsService) {}

  @Post()
  @HasPermissions(PERMISSIONS.REQUISITIONS.CREATE)
  create(
    @Body() dto: CreateRequisitionDto,
    @GetUser() profile: TeachersEntity & { role: ROLES },
  ): Promise<RequisitionEntity> {
    return this.requisitionsService.createRequisition(dto, profile);
  }

  @Get('mine')
  @HasPermissions(PERMISSIONS.REQUISITIONS.VIEW_OWN)
  getMine(
    @GetUser() profile: TeachersEntity & { role: ROLES },
  ): Promise<RequisitionEntity[]> {
    return this.requisitionsService.getMyRequisitions(profile);
  }

  @Get('pending-receiving')
  @HasPermissions(PERMISSIONS.REQUISITIONS.VIEW_OWN)
  getPendingReceiving(
    @GetUser() profile: TeachersEntity & { role: ROLES },
  ): Promise<RequisitionEntity[]> {
    return this.requisitionsService.getPendingReceiving(profile);
  }

  @Get()
  @HasPermissions(PERMISSIONS.REQUISITIONS.VIEW_ALL)
  getAll(): Promise<RequisitionEntity[]> {
    return this.requisitionsService.getAllRequisitions();
  }

  @Get(':id')
  @HasPermissions(PERMISSIONS.REQUISITIONS.VIEW_ALL)
  getOne(@Param('id') id: string): Promise<RequisitionEntity> {
    return this.requisitionsService.getRequisitionById(id);
  }

  @Post(':id/sign/deputy')
  @HasPermissions(PERMISSIONS.REQUISITIONS.SIGN_DEPUTY)
  signAsDeputy(
    @Param('id') id: string,
    @GetUser() profile: TeachersEntity & { role: ROLES },
  ): Promise<RequisitionEntity> {
    return this.requisitionsService.signAsDeputy(id, profile);
  }

  @Post(':id/sign/head')
  @HasPermissions(PERMISSIONS.REQUISITIONS.SIGN_HEAD)
  signAsHead(
    @Param('id') id: string,
    @GetUser() profile: TeachersEntity & { role: ROLES },
  ): Promise<RequisitionEntity> {
    return this.requisitionsService.signAsHead(id, profile);
  }

  @Post(':id/authorise')
  @HasPermissions(PERMISSIONS.REQUISITIONS.AUTHORISE)
  authorise(
    @Param('id') id: string,
    @GetUser() profile: TeachersEntity & { role: ROLES },
  ): Promise<RequisitionEntity> {
    return this.requisitionsService.authorise(id, profile);
  }

  @Post(':id/reject')
  @HasPermissions(PERMISSIONS.REQUISITIONS.AUTHORISE)
  reject(
    @Param('id') id: string,
    @Body() dto: RejectRequisitionDto,
    @GetUser() profile: TeachersEntity & { role: ROLES },
  ): Promise<RequisitionEntity> {
    return this.requisitionsService.reject(id, profile, dto.reason);
  }
}

