/* eslint-disable prettier/prettier */
// src/payment/entities/financial-audit-log.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export enum FinancialAuditAction {
  INVOICE_CREATED = 'INVOICE_CREATED',
  INVOICE_UPDATED = 'INVOICE_UPDATED',
  INVOICE_VOIDED = 'INVOICE_VOIDED',
  RECEIPT_CREATED = 'RECEIPT_CREATED',
  RECEIPT_VOIDED = 'RECEIPT_VOIDED',
  CREDIT_CREATED = 'CREDIT_CREATED',
  CREDIT_APPLIED = 'CREDIT_APPLIED',
}

export enum FinancialAuditEntityType {
  INVOICE = 'INVOICE',
  RECEIPT = 'RECEIPT',
  CREDIT = 'CREDIT',
}

@Entity('financial_audit_log')
@Index(['entityType', 'entityId'])
@Index(['performedBy'])
@Index(['timestamp'])
@Index(['action'])
export class FinancialAuditLogEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({
    type: 'enum',
    enum: FinancialAuditAction,
    nullable: false,
    comment: 'Action performed: INVOICE_CREATED, INVOICE_UPDATED, INVOICE_VOIDED, RECEIPT_CREATED, RECEIPT_VOIDED, CREDIT_CREATED, CREDIT_APPLIED',
  })
  action: FinancialAuditAction;

  @Column({
    type: 'enum',
    enum: FinancialAuditEntityType,
    nullable: false,
    comment: 'Type of entity: INVOICE, RECEIPT, or CREDIT',
  })
  entityType: FinancialAuditEntityType;

  @Column({
    nullable: false,
    comment: 'ID of the entity (invoice, receipt, or credit)',
  })
  entityId: number;

  @Column({
    type: 'json',
    nullable: true,
    comment: 'Before/after values or additional context',
  })
  changes: Record<string, any>;

  @Column({
    nullable: false,
    comment: 'Email or ID of the user who performed this action',
  })
  performedBy: string;

  @CreateDateColumn({ type: 'timestamp' })
  timestamp: Date;

  @Column({
    nullable: true,
    comment: 'IP address of the user who performed this action',
  })
  ipAddress?: string;
}

