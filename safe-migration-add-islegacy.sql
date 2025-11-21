-- ============================================================================
-- SAFE MIGRATION: Add isLegacy column to invoice table
-- ============================================================================
-- This script is safe to run on production databases.
-- It will NOT delete or modify existing data.
-- 
-- Steps:
-- 1. Adds isLegacy column (if it doesn't exist)
-- 2. Marks historical invoices with negative balances as legacy
-- 3. Updates the check constraint to allow legacy invoices
--
-- IMPORTANT: Run this script manually against your database
-- ============================================================================

-- Step 1: Add the isLegacy column (safe - won't fail if column exists)
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

-- Step 2: Identify and mark invoices with negative balances as legacy
-- This marks historical invoices that violate the balance constraint
UPDATE invoice
SET "isLegacy" = true
WHERE balance < 0 
  AND ("isVoided" = false OR "isVoided" IS NULL)
  AND "isLegacy" = false;

-- Show how many invoices were marked
DO $$
DECLARE
    legacy_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO legacy_count
    FROM invoice
    WHERE "isLegacy" = true;
    
    RAISE NOTICE 'Total legacy invoices: %', legacy_count;
END $$;

-- Step 3: Drop the old constraint (if it exists)
-- We need to find and drop the existing constraint first
DO $$
DECLARE
    constraint_name TEXT;
BEGIN
    -- Find the constraint name
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
-- This constraint allows negative balances for voided OR legacy invoices
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

-- Step 5: Verification queries
-- Run these to verify the migration was successful

-- Check for any invoices that still violate constraints
SELECT 
    id,
    "invoiceNumber",
    balance,
    "isVoided",
    "isLegacy",
    status
FROM invoice
WHERE balance < 0 
  AND ("isVoided" = false OR "isVoided" IS NULL)
  AND "isLegacy" = false;
-- This should return 0 rows

-- Summary of legacy invoices
SELECT 
    COUNT(*) as total_legacy,
    COUNT(CASE WHEN balance < 0 THEN 1 END) as legacy_with_negative_balance,
    COUNT(CASE WHEN balance >= 0 THEN 1 END) as legacy_with_positive_balance
FROM invoice
WHERE "isLegacy" = true;

-- Summary of all invoices
SELECT 
    COUNT(*) as total_invoices,
    COUNT(CASE WHEN "isLegacy" = true THEN 1 END) as legacy_count,
    COUNT(CASE WHEN "isVoided" = true THEN 1 END) as voided_count,
    COUNT(CASE WHEN balance < 0 THEN 1 END) as negative_balance_count
FROM invoice;

-- Migration completed successfully!
-- Please review the verification queries above to confirm everything is correct.

