-- Migration: Make receipt description column nullable
-- This script removes the NOT NULL constraint from the description column in the receipts table
-- to allow optional descriptions as per the original implementation

-- Check current constraint
SELECT 
    column_name, 
    is_nullable, 
    data_type 
FROM information_schema.columns 
WHERE table_name = 'receipts' 
AND column_name = 'description';

-- Remove NOT NULL constraint from description column
ALTER TABLE receipts 
ALTER COLUMN description DROP NOT NULL;

-- Verify the change
SELECT 
    column_name, 
    is_nullable, 
    data_type 
FROM information_schema.columns 
WHERE table_name = 'receipts' 
AND column_name = 'description';

-- Optional: Update any existing empty descriptions to NULL for consistency
-- UPDATE receipts SET description = NULL WHERE description = '' OR description IS NULL;

COMMIT;



