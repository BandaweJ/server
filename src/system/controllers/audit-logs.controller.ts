/* eslint-disable prettier/prettier */
import {
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { AuditService } from 'src/payment/services/audit.service';
import {
  FinancialAuditAction,
  FinancialAuditEntityType,
} from 'src/payment/entities/financial-audit-log.entity';

@Controller('system/audit')
@UseGuards(JwtAuthGuard)
export class AuditLogsController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  async getAuditLogs(
    @Query('action') action?: FinancialAuditAction,
    @Query('entityType') entityType?: FinancialAuditEntityType,
    @Query('entityId') entityId?: string,
    @Query('performedBy') performedBy?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const filters: any = {};

    if (action) {
      filters.action = action;
    }

    if (entityType) {
      filters.entityType = entityType;
    }

    if (entityId) {
      filters.entityId = parseInt(entityId, 10);
    }

    if (performedBy) {
      filters.performedBy = performedBy;
    }

    if (startDate) {
      filters.startDate = new Date(startDate);
    }

    if (endDate) {
      filters.endDate = new Date(endDate);
    }

    if (limit) {
      filters.limit = parseInt(limit, 10);
    }

    if (offset) {
      filters.offset = parseInt(offset, 10);
    }

    return await this.auditService.getAuditLogs(filters);
  }
}

