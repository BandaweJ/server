-- ============================================================================
-- RENDER MIGRATION: Add isLegacy column to invoice table
-- ============================================================================
-- Copy-paste this entire script into Render's PostgreSQL Shell
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
DO $$
DECLARE
    constraint_name TEXT;
BEGIN
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
-- Check for any invoices that still violate constraints (should be 0)
SELECT 
    COUNT(*) as violating_invoices
FROM invoice
WHERE balance < 0 
  AND ("isVoided" = false OR "isVoided" IS NULL)
  AND "isLegacy" = false;

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

