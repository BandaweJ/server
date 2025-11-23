-- ============================================================================
-- MIGRATION: Add relatedReceiptId column to credit_invoice_allocations table
-- ============================================================================
-- This script adds the relatedReceiptId column that tracks which receipt
-- created the credit that was applied to an invoice.
-- 
-- SAFE TO RUN: This script is idempotent and won't fail if column exists
-- ============================================================================

-- Step 1: Add the relatedReceiptId column (safe - won't fail if column exists)
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
        
        -- Add a comment to document the column
        COMMENT ON COLUMN credit_invoice_allocations."relatedReceiptId" IS 
        'ID of the receipt that created the credit used in this allocation (for precise reversal on void)';
        
        RAISE NOTICE 'Column relatedReceiptId added successfully';
    ELSE
        RAISE NOTICE 'Column relatedReceiptId already exists, skipping';
    END IF;
END $$;

-- Step 2: Verification
-- Check that the column exists
SELECT 
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'credit_invoice_allocations'
  AND column_name = 'relatedReceiptId';

-- Migration completed successfully!

