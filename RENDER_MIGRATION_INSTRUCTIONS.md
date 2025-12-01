# Render Database Migration Instructions

## Migration: Make Receipt Description Nullable

### Background
The receipt description field was changed from required to optional to match the original implementation. This requires updating the database schema on Render to remove the NOT NULL constraint.

### Option 1: Using TypeORM Migration (Recommended)

1. **Deploy the code changes** to Render (the migration file is included)

2. **Run the migration** via Render's shell or by connecting to the database:
   ```bash
   npm run migration:run
   ```

### Option 2: Manual SQL Execution

If you prefer to run the SQL directly, connect to your Render PostgreSQL database and execute:

```sql
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
```

### Connection Details
Use your existing Render PostgreSQL connection string:
```
postgresql://school_zbbz_user:dTgcQDeptWds5KCE90YGHi4TIOtBGJkl@dpg-co02nkicn0vc73ca4ltg-a.oregon-postgres.render.com/school_zbbz
```

### Verification
After running the migration, the `description` column should show `is_nullable = YES` in the information_schema.columns table.

### Impact
- ✅ Existing receipts with descriptions will remain unchanged
- ✅ New receipts can be created without descriptions
- ✅ Default descriptions will be auto-generated when none provided
- ✅ Custom descriptions still work when provided

### Rollback (if needed)
If you need to rollback this change:
```bash
npm run migration:revert
```

Or manually:
```sql
-- First, update any NULL descriptions to empty string
UPDATE receipts SET description = 'Payment receipt' WHERE description IS NULL;

-- Then add back NOT NULL constraint
ALTER TABLE receipts ALTER COLUMN description SET NOT NULL;
```



