-- ============================================================================
-- COMPREHENSIVE MIGRATION: Add missing tables and columns
-- ============================================================================
-- This script adds all missing database objects needed for the payment system:
-- 1. relatedReceiptId column in credit_invoice_allocations
-- 2. credit_transactions table
-- 3. financial_audit_log table (if needed)
-- 
-- SAFE TO RUN: This script is idempotent and won't fail if objects exist
-- ============================================================================

-- ============================================================================
-- PART 1: Add relatedReceiptId column to credit_invoice_allocations
-- ============================================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'credit_invoice_allocations' 
        AND column_name = 'relatedReceiptId'
    ) THEN
        ALTER TABLE credit_invoice_allocations 
        ADD COLUMN "relatedReceiptId" integer NULL;
        
        COMMENT ON COLUMN credit_invoice_allocations."relatedReceiptId" IS 
        'ID of the receipt that created the credit used in this allocation (for precise reversal on void)';
        
        RAISE NOTICE 'Column relatedReceiptId added to credit_invoice_allocations';
    ELSE
        RAISE NOTICE 'Column relatedReceiptId already exists in credit_invoice_allocations, skipping';
    END IF;
END $$;

-- ============================================================================
-- PART 2: Create credit_transactions table
-- ============================================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.tables 
        WHERE table_name = 'credit_transactions'
    ) THEN
        -- Create the enum type for transaction type
        CREATE TYPE "credit_transaction_type_enum" AS ENUM ('CREDIT', 'DEDUCTION', 'APPLICATION', 'REVERSAL');
        
        -- Create the table
        CREATE TABLE "credit_transactions" (
            "id" SERIAL NOT NULL,
            "studentCreditId" integer NOT NULL,
            "amount" numeric(10,2) NOT NULL,
            "transactionType" "credit_transaction_type_enum" NOT NULL,
            "source" text NOT NULL,
            "relatedReceiptId" integer NULL,
            "relatedInvoiceId" integer NULL,
            "transactionDate" TIMESTAMP NOT NULL DEFAULT now(),
            "performedBy" character varying NOT NULL,
            CONSTRAINT "PK_credit_transactions" PRIMARY KEY ("id"),
            CONSTRAINT "FK_credit_transactions_studentCredit" 
                FOREIGN KEY ("studentCreditId") 
                REFERENCES "student_credits"("id") 
                ON DELETE RESTRICT
        );
        
        -- Add comments
        COMMENT ON TABLE "credit_transactions" IS 'Audit trail for all credit transactions';
        COMMENT ON COLUMN "credit_transactions"."amount" IS 'Amount: Positive for credit/reversal, negative for deduction/application';
        COMMENT ON COLUMN "credit_transactions"."transactionType" IS 'Type of transaction: CREDIT, APPLICATION, or REVERSAL';
        COMMENT ON COLUMN "credit_transactions"."source" IS 'Source description: e.g., "Overpayment from Receipt REC-123"';
        COMMENT ON COLUMN "credit_transactions"."relatedReceiptId" IS 'ID of related receipt (if credit came from receipt)';
        COMMENT ON COLUMN "credit_transactions"."relatedInvoiceId" IS 'ID of related invoice (if credit was applied to invoice)';
        
        RAISE NOTICE 'Table credit_transactions created successfully';
    ELSE
        RAISE NOTICE 'Table credit_transactions already exists, skipping';
    END IF;
END $$;

-- ============================================================================
-- PART 3: Create financial_audit_log table (if needed)
-- ============================================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.tables 
        WHERE table_name = 'financial_audit_log'
    ) THEN
        -- Create enum types
        CREATE TYPE "financial_audit_action_enum" AS ENUM (
            'INVOICE_CREATED', 'INVOICE_UPDATED', 'INVOICE_VOIDED',
            'RECEIPT_CREATED', 'RECEIPT_VOIDED',
            'CREDIT_CREATED', 'CREDIT_APPLIED'
        );
        
        CREATE TYPE "financial_audit_entity_type_enum" AS ENUM ('INVOICE', 'RECEIPT', 'CREDIT');
        
        -- Create the table
        CREATE TABLE "financial_audit_log" (
            "id" SERIAL NOT NULL,
            "action" "financial_audit_action_enum" NOT NULL,
            "entityType" "financial_audit_entity_type_enum" NOT NULL,
            "entityId" integer NOT NULL,
            "changes" jsonb NULL,
            "performedBy" character varying NOT NULL,
            "timestamp" TIMESTAMP NOT NULL DEFAULT now(),
            "ipAddress" character varying NULL,
            CONSTRAINT "PK_financial_audit_log" PRIMARY KEY ("id")
        );
        
        -- Create indexes
        CREATE INDEX "IDX_financial_audit_log_entity" ON "financial_audit_log" ("entityType", "entityId");
        CREATE INDEX "IDX_financial_audit_log_performedBy" ON "financial_audit_log" ("performedBy");
        CREATE INDEX "IDX_financial_audit_log_timestamp" ON "financial_audit_log" ("timestamp");
        CREATE INDEX "IDX_financial_audit_log_action" ON "financial_audit_log" ("action");
        
        -- Add comments
        COMMENT ON TABLE "financial_audit_log" IS 'Audit trail for all financial operations';
        COMMENT ON COLUMN "financial_audit_log"."action" IS 'Action performed: INVOICE_CREATED, INVOICE_UPDATED, INVOICE_VOIDED, RECEIPT_CREATED, RECEIPT_VOIDED, CREDIT_CREATED, CREDIT_APPLIED';
        COMMENT ON COLUMN "financial_audit_log"."entityType" IS 'Type of entity: INVOICE, RECEIPT, or CREDIT';
        COMMENT ON COLUMN "financial_audit_log"."changes" IS 'Before/after values or additional context';
        
        RAISE NOTICE 'Table financial_audit_log created successfully';
    ELSE
        RAISE NOTICE 'Table financial_audit_log already exists, skipping';
    END IF;
END $$;

-- ============================================================================
-- VERIFICATION
-- ============================================================================

-- Verify relatedReceiptId column
SELECT 
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'credit_invoice_allocations'
  AND column_name = 'relatedReceiptId';

-- Verify credit_transactions table
SELECT 
    table_name,
    (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'credit_transactions') as column_count
FROM information_schema.tables
WHERE table_name = 'credit_transactions';

-- Verify financial_audit_log table
SELECT 
    table_name,
    (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'financial_audit_log') as column_count
FROM information_schema.tables
WHERE table_name = 'financial_audit_log';

-- Migration completed successfully!



