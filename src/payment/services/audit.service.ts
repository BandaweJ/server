/* eslint-disable prettier/prettier */
// src/payment/services/audit.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
import {
  FinancialAuditLogEntity,
  FinancialAuditAction,
  FinancialAuditEntityType,
} from '../entities/financial-audit-log.entity';
import { logStructured } from '../utils/logger.util';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectRepository(FinancialAuditLogEntity)
    private readonly auditLogRepository: Repository<FinancialAuditLogEntity>,
  ) {}

  /**
   * Logs a financial audit event
   * @param action - The action performed
   * @param entityType - Type of entity (INVOICE, RECEIPT, CREDIT)
   * @param entityId - ID of the entity
   * @param performedBy - Email or ID of the user who performed the action
   * @param changes - Before/after values or additional context
   * @param ipAddress - Optional IP address of the user
   * @param transactionalEntityManager - Optional entity manager for transaction context
   */
  async logFinancialOperation(
    action: FinancialAuditAction,
    entityType: FinancialAuditEntityType,
    entityId: number,
    performedBy: string,
    changes?: Record<string, any>,
    ipAddress?: string,
    transactionalEntityManager?: EntityManager,
  ): Promise<FinancialAuditLogEntity> {
    try {
      const auditLog = transactionalEntityManager
        ? transactionalEntityManager.create(FinancialAuditLogEntity, {
            action,
            entityType,
            entityId,
            performedBy,
            changes: changes || {},
            ipAddress,
          })
        : this.auditLogRepository.create({
            action,
            entityType,
            entityId,
            performedBy,
            changes: changes || {},
            ipAddress,
          });

      const saved = transactionalEntityManager
        ? await transactionalEntityManager.save(auditLog)
        : await this.auditLogRepository.save(auditLog);

      logStructured(
        this.logger,
        'log',
        'audit.log.created',
        'Financial audit log created',
        {
          action,
          entityType,
          entityId,
          performedBy,
          auditLogId: saved.id,
        },
      );

      return saved;
    } catch (error) {
      // Don't fail the main operation if audit logging fails
      logStructured(
        this.logger,
        'error',
        'audit.log.failed',
        'Failed to create financial audit log',
        {
          action,
          entityType,
          entityId,
          performedBy,
          error: error instanceof Error ? error.message : String(error),
        },
      );
      // Return a placeholder or rethrow based on your error handling strategy
      // For now, we'll silently fail to not disrupt the main operation
      throw error;
    }
  }

  /**
   * Logs invoice creation
   */
  async logInvoiceCreated(
    invoiceId: number,
    performedBy: string,
    changes?: Record<string, any>,
    ipAddress?: string,
    transactionalEntityManager?: EntityManager,
  ): Promise<FinancialAuditLogEntity> {
    return this.logFinancialOperation(
      FinancialAuditAction.INVOICE_CREATED,
      FinancialAuditEntityType.INVOICE,
      invoiceId,
      performedBy,
      changes,
      ipAddress,
      transactionalEntityManager,
    );
  }

  /**
   * Logs invoice update
   */
  async logInvoiceUpdated(
    invoiceId: number,
    performedBy: string,
    changes?: Record<string, any>,
    ipAddress?: string,
    transactionalEntityManager?: EntityManager,
  ): Promise<FinancialAuditLogEntity> {
    return this.logFinancialOperation(
      FinancialAuditAction.INVOICE_UPDATED,
      FinancialAuditEntityType.INVOICE,
      invoiceId,
      performedBy,
      changes,
      ipAddress,
      transactionalEntityManager,
    );
  }

  /**
   * Logs invoice voiding
   */
  async logInvoiceVoided(
    invoiceId: number,
    performedBy: string,
    changes?: Record<string, any>,
    ipAddress?: string,
    transactionalEntityManager?: EntityManager,
  ): Promise<FinancialAuditLogEntity> {
    return this.logFinancialOperation(
      FinancialAuditAction.INVOICE_VOIDED,
      FinancialAuditEntityType.INVOICE,
      invoiceId,
      performedBy,
      changes,
      ipAddress,
      transactionalEntityManager,
    );
  }

  /**
   * Logs receipt creation
   */
  async logReceiptCreated(
    receiptId: number,
    performedBy: string,
    changes?: Record<string, any>,
    ipAddress?: string,
    transactionalEntityManager?: EntityManager,
  ): Promise<FinancialAuditLogEntity> {
    return this.logFinancialOperation(
      FinancialAuditAction.RECEIPT_CREATED,
      FinancialAuditEntityType.RECEIPT,
      receiptId,
      performedBy,
      changes,
      ipAddress,
      transactionalEntityManager,
    );
  }

  /**
   * Logs receipt voiding
   */
  async logReceiptVoided(
    receiptId: number,
    performedBy: string,
    changes?: Record<string, any>,
    ipAddress?: string,
    transactionalEntityManager?: EntityManager,
  ): Promise<FinancialAuditLogEntity> {
    return this.logFinancialOperation(
      FinancialAuditAction.RECEIPT_VOIDED,
      FinancialAuditEntityType.RECEIPT,
      receiptId,
      performedBy,
      changes,
      ipAddress,
      transactionalEntityManager,
    );
  }

  /**
   * Logs credit creation
   */
  async logCreditCreated(
    creditId: number,
    performedBy: string,
    changes?: Record<string, any>,
    ipAddress?: string,
    transactionalEntityManager?: EntityManager,
  ): Promise<FinancialAuditLogEntity> {
    return this.logFinancialOperation(
      FinancialAuditAction.CREDIT_CREATED,
      FinancialAuditEntityType.CREDIT,
      creditId,
      performedBy,
      changes,
      ipAddress,
      transactionalEntityManager,
    );
  }

  /**
   * Logs credit application
   */
  async logCreditApplied(
    creditId: number,
    performedBy: string,
    changes?: Record<string, any>,
    ipAddress?: string,
    transactionalEntityManager?: EntityManager,
  ): Promise<FinancialAuditLogEntity> {
    return this.logFinancialOperation(
      FinancialAuditAction.CREDIT_APPLIED,
      FinancialAuditEntityType.CREDIT,
      creditId,
      performedBy,
      changes,
      ipAddress,
      transactionalEntityManager,
    );
  }

  /**
   * Get all audit logs with optional filtering
   */
  async getAuditLogs(
    filters?: {
      action?: FinancialAuditAction;
      entityType?: FinancialAuditEntityType;
      entityId?: number;
      performedBy?: string;
      startDate?: Date;
      endDate?: Date;
      limit?: number;
      offset?: number;
    },
  ): Promise<{ logs: FinancialAuditLogEntity[]; total: number }> {
    const queryBuilder = this.auditLogRepository.createQueryBuilder('audit');

    if (filters?.action) {
      queryBuilder.andWhere('audit.action = :action', { action: filters.action });
    }

    if (filters?.entityType) {
      queryBuilder.andWhere('audit.entityType = :entityType', { entityType: filters.entityType });
    }

    if (filters?.entityId) {
      queryBuilder.andWhere('audit.entityId = :entityId', { entityId: filters.entityId });
    }

    if (filters?.performedBy) {
      queryBuilder.andWhere('audit.performedBy = :performedBy', { performedBy: filters.performedBy });
    }

    if (filters?.startDate) {
      queryBuilder.andWhere('audit.timestamp >= :startDate', { startDate: filters.startDate });
    }

    if (filters?.endDate) {
      queryBuilder.andWhere('audit.timestamp <= :endDate', { endDate: filters.endDate });
    }

    // Get total count
    const total = await queryBuilder.getCount();

    // Apply pagination
    if (filters?.limit) {
      queryBuilder.limit(filters.limit);
    }
    if (filters?.offset) {
      queryBuilder.offset(filters.offset);
    }

    // Order by timestamp descending (newest first)
    queryBuilder.orderBy('audit.timestamp', 'DESC');

    const logs = await queryBuilder.getMany();

    return { logs, total };
  }
}

