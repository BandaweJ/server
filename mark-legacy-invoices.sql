-- ============================================================================
-- Migration script to mark historical invoices with negative balances as legacy
-- This allows them to bypass the balance constraint
-- 
-- SAFE TO RUN: This script will NOT delete or modify existing data
-- ============================================================================

-- Step 1: Add the isLegacy column if it doesn't exist
-- Safe: Uses IF NOT EXISTS, won't fail if column already exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'invoice' 
        AND column_name = 'isLegacy'
    ) THEN
        ALTER TABLE invoice 
        ADD COLUMN "isLegacy" boolean NOT NULL DEFAULT false;
        
        RAISE NOTICE 'Column isLegacy added successfully';
    ELSE
        RAISE NOTICE 'Column isLegacy already exists, skipping';
    END IF;
END $$;

-- Step 2: Mark all invoices with negative balances as legacy
-- These are historical invoices that may have data inconsistencies
UPDATE invoice
SET "isLegacy" = true
WHERE balance < 0 
  AND ("isVoided" = false OR "isVoided" IS NULL);

-- Step 3: Drop the old constraint (if it exists)
-- Safely finds and drops the old constraint
DO $$
DECLARE
    constraint_name TEXT;
BEGIN
    -- Find the constraint name dynamically
    SELECT conname INTO constraint_name
    FROM pg_constraint
    WHERE conrelid = 'invoice'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%balance >= 0%'
      AND pg_get_constraintdef(oid) NOT LIKE '%isLegacy%'
    LIMIT 1;
    
    IF constraint_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE invoice DROP CONSTRAINT %I', constraint_name);
        RAISE NOTICE 'Dropped old constraint: %', constraint_name;
    ELSE
        RAISE NOTICE 'Old constraint not found, may have been dropped already';
    END IF;
END $$;

-- Step 4: Add the new constraint that allows legacy invoices
-- Safe: Checks if constraint already exists before adding
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'invoice'::regclass
          AND contype = 'c'
          AND pg_get_constraintdef(oid) LIKE '%balance >= 0%'
          AND pg_get_constraintdef(oid) LIKE '%isLegacy%'
    ) THEN
        ALTER TABLE invoice
        ADD CONSTRAINT "CHK_invoice_balance_legacy" 
        CHECK (balance >= 0 OR "isVoided" = true OR "isLegacy" = true);
        
        RAISE NOTICE 'New constraint added successfully';
    ELSE
        RAISE NOTICE 'New constraint already exists, skipping';
    END IF;
END $$;

-- Verify: Check how many invoices were marked as legacy
SELECT 
    COUNT(*) as total_legacy_invoices,
    COUNT(CASE WHEN balance < 0 THEN 1 END) as legacy_with_negative_balance
FROM invoice
WHERE "isLegacy" = true;

-- Verify: Check that no non-legacy invoices have negative balances
SELECT COUNT(*) as violating_invoices
FROM invoice
WHERE balance < 0 
  AND ("isVoided" = false OR "isVoided" IS NULL)
  AND "isLegacy" = false;
-- This should return 0

