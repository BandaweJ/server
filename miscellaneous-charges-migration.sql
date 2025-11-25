-- Migration: Add miscellaneous charges fee types
-- This script adds new fee types to support miscellaneous charges like grooming, broken furniture, and lost books

-- Add new enum values to the fees_name_enum type
DO $$
BEGIN
    -- Check if the enum values don't already exist before adding them
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'groomingFee' 
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'fees_name_enum')
    ) THEN
        ALTER TYPE fees_name_enum ADD VALUE 'groomingFee';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'brokenFurnitureFee' 
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'fees_name_enum')
    ) THEN
        ALTER TYPE fees_name_enum ADD VALUE 'brokenFurnitureFee';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'lostBooksFee' 
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'fees_name_enum')
    ) THEN
        ALTER TYPE fees_name_enum ADD VALUE 'lostBooksFee';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'miscellaneousCharge' 
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'fees_name_enum')
    ) THEN
        ALTER TYPE fees_name_enum ADD VALUE 'miscellaneousCharge';
    END IF;
END $$;

-- Optional: Insert default fee records for the new miscellaneous charges
-- These can be created through the admin interface instead
INSERT INTO fees (amount, description, name) VALUES 
    (10.00, 'Student grooming and appearance fee', 'groomingFee'),
    (50.00, 'Broken furniture replacement fee', 'brokenFurnitureFee'),
    (25.00, 'Lost books replacement fee', 'lostBooksFee'),
    (0.00, 'General miscellaneous charge', 'miscellaneousCharge')
ON CONFLICT (name) DO NOTHING;

-- Verify the migration
SELECT enumlabel FROM pg_enum 
WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'fees_name_enum')
ORDER BY enumlabel;
