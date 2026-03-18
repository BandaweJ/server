import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PermissionsGuard } from 'src/auth/guards/permissions.guard';
import { HasPermissions } from 'src/auth/decorators/has-permissions.decorator';
import { PERMISSIONS } from 'src/auth/models/permissions.constants';
import { GetUser } from 'src/auth/decorators/get-user.decorator';
import { TeachersEntity } from 'src/profiles/entities/teachers.entity';
import { ROLES } from 'src/auth/models/roles.enum';
import { IncidentsService } from './incidents.service';
import { CreateIncidentDto } from './dtos/create-incident.dto';
import { RejectIncidentDto } from './dtos/reject-incident.dto';

@Controller('incidents')
@UseGuards(AuthGuard(), PermissionsGuard)
export class IncidentsController {
  constructor(private readonly incidentsService: IncidentsService) {}

  @Post()
  @HasPermissions(PERMISSIONS.INCIDENTS.CREATE)
  create(
    @GetUser() profile: TeachersEntity & { role: ROLES; accountId?: string },
    @Body() dto: CreateIncidentDto,
  ) {
    return this.incidentsService.create(profile, dto);
  }

  @Get('mine')
  @HasPermissions(PERMISSIONS.INCIDENTS.VIEW_OWN)
  getMine(
    @GetUser() profile: TeachersEntity & { role: ROLES; accountId?: string },
  ) {
    return this.incidentsService.getMine(profile);
  }

  @Get('pending-approval')
  @HasPermissions(PERMISSIONS.INCIDENTS.VIEW_ALL)
  getPendingApproval(
    @GetUser() profile: TeachersEntity & { role: ROLES; accountId?: string },
  ) {
    return this.incidentsService.getPendingApproval(profile);
  }

  @Post(':id/confirm-hod')
  @HasPermissions(PERMISSIONS.INCIDENTS.CONFIRM_HOD)
  confirmHod(
    @GetUser() profile: TeachersEntity & { role: ROLES; accountId?: string },
    @Param('id') id: string,
  ) {
    return this.incidentsService.confirmHod(profile, id);
  }

  @Post(':id/sign-deputy')
  @HasPermissions(PERMISSIONS.INCIDENTS.SIGN_DEPUTY)
  signDeputy(
    @GetUser() profile: TeachersEntity & { role: ROLES; accountId?: string },
    @Param('id') id: string,
  ) {
    return this.incidentsService.signDeputy(profile, id);
  }

  @Post(':id/sign-head')
  @HasPermissions(PERMISSIONS.INCIDENTS.SIGN_HEAD)
  signHead(
    @GetUser() profile: TeachersEntity & { role: ROLES; accountId?: string },
    @Param('id') id: string,
  ) {
    return this.incidentsService.signHead(profile, id);
  }

  @Post(':id/accept')
  @HasPermissions(PERMISSIONS.INCIDENTS.ACCEPT)
  accept(
    @GetUser() profile: TeachersEntity & { role: ROLES; accountId?: string },
    @Param('id') id: string,
  ) {
    return this.incidentsService.accept(profile, id);
  }

  @Post(':id/reject')
  @HasPermissions(PERMISSIONS.INCIDENTS.REJECT)
  reject(
    @GetUser() profile: TeachersEntity & { role: ROLES; accountId?: string },
    @Param('id') id: string,
    @Body() dto: RejectIncidentDto,
  ) {
    return this.incidentsService.reject(profile, id, dto.reason);
  }
}

