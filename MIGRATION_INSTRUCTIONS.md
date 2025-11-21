# Safe Database Migration Instructions

## ⚠️ Important: Protecting Your Data

**DO NOT enable `synchronize: true` in production!** This can cause data loss.

Instead, use the safe manual migration script provided below.

---

## 🛡️ Safe Migration Approach

### Option 1: Manual SQL Script (Recommended)

This is the **safest** method - you have full control and can review everything before running.

#### Steps:

1. **Backup your database first!**
   ```bash
   # PostgreSQL backup example
   pg_dump -h your_host -U your_user -d your_database > backup_before_migration.sql
   ```

2. **Review the migration script**
   - Open `server/safe-migration-add-islegacy.sql`
   - Review all SQL statements
   - Understand what each step does

3. **Test on a development/staging database first** (if available)

4. **Run the migration script**
   ```bash
   # Using psql command line
   psql -h your_host -U your_user -d your_database -f server/safe-migration-add-islegacy.sql
   
   # Or using a database GUI tool (pgAdmin, DBeaver, etc.)
   # Just copy and paste the SQL from the file
   ```

5. **Verify the results**
   - Check the verification queries at the end of the script
   - Ensure no data was lost
   - Confirm legacy invoices are marked correctly

6. **Restart your application**
   - The application will now work with the new `isLegacy` column
   - No need to enable `synchronize: true`

---

### Option 2: TypeORM Migrations (Advanced)

If you want to use TypeORM's migration system:

#### Setup TypeORM Migrations:

1. **Install TypeORM CLI** (if not already installed)
   ```bash
   npm install -g typeorm
   ```

2. **Create migrations directory**
   ```bash
   mkdir -p server/src/migrations
   ```

3. **Configure TypeORM for migrations** in `app.module.ts`:
   ```typescript
   migrations: ['dist/migrations/*.js'],
   migrationsRun: false, // Set to true to auto-run migrations on startup
   ```

4. **Generate migration** (TypeORM will detect entity changes):
   ```bash
   cd server
   typeorm migration:generate -n AddIsLegacyToInvoice
   ```

5. **Review the generated migration file** in `src/migrations/`

6. **Run the migration**:
   ```bash
   typeorm migration:run
   ```

**Note:** This requires more setup but provides better version control of schema changes.

---

## ✅ What the Migration Does

The migration script:

1. ✅ **Adds `isLegacy` column** - Safe, won't fail if column exists
2. ✅ **Marks historical invoices** - Only marks invoices with negative balances
3. ✅ **Updates constraint** - Allows legacy invoices to have negative balances
4. ✅ **Verification queries** - Shows you what changed

**No data is deleted or modified** (except setting `isLegacy = true` on historical invoices).

---

## 🔍 Verification After Migration

After running the migration, verify:

1. **Check legacy invoices:**
   ```sql
   SELECT COUNT(*) FROM invoice WHERE "isLegacy" = true;
   ```

2. **Check for constraint violations:**
   ```sql
   SELECT COUNT(*) 
   FROM invoice 
   WHERE balance < 0 
     AND ("isVoided" = false OR "isVoided" IS NULL)
     AND "isLegacy" = false;
   -- Should return 0
   ```

3. **Test your application:**
   - Start the server
   - Try creating a new invoice
   - Try creating a receipt
   - Verify everything works

---

## 🚨 Rollback Plan (If Something Goes Wrong)

If you need to rollback:

1. **Restore from backup:**
   ```bash
   psql -h your_host -U your_user -d your_database < backup_before_migration.sql
   ```

2. **Or manually revert:**
   ```sql
   -- Remove the constraint
   ALTER TABLE invoice DROP CONSTRAINT IF EXISTS "CHK_invoice_balance_legacy";
   
   -- Remove the column (if you want to completely revert)
   ALTER TABLE invoice DROP COLUMN IF EXISTS "isLegacy";
   ```

---

## 📝 Current Configuration

Your `app.module.ts` is correctly configured:

```typescript
synchronize: process.env.NODE_ENV === 'development',
```

This means:
- ✅ **Development**: `synchronize: true` (auto-creates schema)
- ✅ **Production**: `synchronize: false` (requires manual migrations)

**Keep it this way!** Never set `synchronize: true` in production.

---

## ✅ Summary

1. ✅ **Backup your database**
2. ✅ **Run `safe-migration-add-islegacy.sql`**
3. ✅ **Verify the results**
4. ✅ **Restart your application**
5. ✅ **Keep `synchronize: false` in production**

You're all set! 🎉

