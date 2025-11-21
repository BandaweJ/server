# Quick Migration Guide - Add isLegacy Column

## ✅ Safe Approach (No Data Loss Risk)

**You do NOT need to enable `synchronize: true`!**

### Simple 3-Step Process:

1. **Backup your database** (safety first!)
   ```bash
   pg_dump -h your_host -U your_user -d your_database > backup.sql
   ```

2. **Run the migration script**
   ```bash
   psql -h your_host -U your_user -d your_database -f server/safe-migration-add-islegacy.sql
   ```
   
   Or use your database GUI (pgAdmin, DBeaver, etc.) and run the SQL from the file.

3. **Restart your application**
   - The app will automatically work with the new column
   - No code changes needed
   - No need to enable `synchronize: true`

---

## 🔍 What Gets Changed

✅ **Added**: `isLegacy` column to `invoice` table  
✅ **Updated**: Historical invoices with negative balances are marked as legacy  
✅ **Updated**: Database constraint now allows legacy invoices  
❌ **NOT Changed**: No data deleted, no existing data modified (except setting `isLegacy = true`)

---

## ✅ Your Current Config is Perfect

Your `app.module.ts` already has:
```typescript
synchronize: process.env.NODE_ENV === 'development',
```

**Keep it this way!** This means:
- Development: Auto-creates schema (safe for dev)
- Production: Requires manual migrations (safe for production)

---

## 🚨 What NOT to Do

❌ **DON'T** set `synchronize: true` in production  
❌ **DON'T** run migrations without backing up first  
❌ **DON'T** skip the verification queries

---

## 📋 Files Available

- `server/safe-migration-add-islegacy.sql` - **Use this one** (most comprehensive)
- `server/mark-legacy-invoices.sql` - Alternative version
- `server/MIGRATION_INSTRUCTIONS.md` - Detailed instructions

---

## ✅ After Migration

1. Check verification queries in the script output
2. Restart your application
3. Test creating an invoice
4. Test creating a receipt
5. Everything should work! 🎉

---

**That's it!** The migration is safe and won't cause data loss.

