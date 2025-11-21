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
}

