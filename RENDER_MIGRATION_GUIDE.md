# Running Migration on Render

## Overview

Since your backend and database are hosted on Render, you have several options to run the migration safely.

---

## Option 1: Using Render Shell (Recommended - Easiest)

This is the simplest method using Render's built-in shell access.

### Steps:

1. **Go to your Render Dashboard**
   - Navigate to https://dashboard.render.com
   - Log in to your account

2. **Open your PostgreSQL Database Service**
   - Click on your PostgreSQL database service
   - Go to the **"Shell"** tab (or **"Connect"** → **"Shell"**)

3. **Connect to your database**
   ```bash
   # Render will automatically provide the connection string
   # Just run:
   psql $DATABASE_URL
   ```

4. **Run the migration script**
   ```sql
   -- Copy and paste the contents of safe-migration-add-islegacy.sql
   -- Or upload the file and run:
   \i /path/to/safe-migration-add-islegacy.sql
   ```

   **OR** copy-paste the SQL directly:
   ```sql
   -- Step 1: Add the isLegacy column
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

   -- Step 2: Mark invoices with negative balances as legacy
   UPDATE invoice
   SET "isLegacy" = true
   WHERE balance < 0 
     AND ("isVoided" = false OR "isVoided" IS NULL)
     AND "isLegacy" = false;

   -- Step 3: Drop old constraint (if exists)
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
       END IF;
   END $$;

   -- Step 4: Add new constraint
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
       END IF;
   END $$;

   -- Verification
   SELECT COUNT(*) as violating_invoices
   FROM invoice
   WHERE balance < 0 
     AND ("isVoided" = false OR "isVoided" IS NULL)
     AND "isLegacy" = false;
   -- Should return 0
   ```

5. **Verify the results**
   - Check the output messages
   - Run the verification queries at the end

---

## Option 2: Using Render Web Service Shell

If you prefer to run it from your backend service:

1. **Go to your Backend Web Service on Render**
   - Click on your backend service
   - Go to the **"Shell"** tab

2. **Navigate to your project directory**
   ```bash
   cd /opt/render/project/src/server
   # Or wherever your server code is located
   ```

3. **Run the migration using psql**
   ```bash
   # Get database URL from environment
   psql $DATABASE_URL -f safe-migration-add-islegacy.sql
   ```

   **OR** if the file isn't in the repo, copy-paste the SQL directly:
   ```bash
   psql $DATABASE_URL << EOF
   -- Paste the SQL content here
   EOF
   ```

---

## Option 3: Create a One-Time Script (For Future Migrations)

Create a migration script that can be run as a one-time job on Render.

### Create `server/scripts/run-migration.ts`:

```typescript
import { DataSource } from 'typeorm';
import { readFileSync } from 'fs';
import { join } from 'path';

async function runMigration() {
  const dataSource = new DataSource({
    type: 'postgres',
    url: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  await dataSource.initialize();

  const migrationSQL = readFileSync(
    join(__dirname, '../safe-migration-add-islegacy.sql'),
    'utf-8'
  );

  await dataSource.query(migrationSQL);

  console.log('✅ Migration completed successfully!');
  await dataSource.destroy();
}

runMigration().catch(console.error);
```

Then run it from Render Shell:
```bash
cd /opt/render/project/src/server
npm run build
node dist/scripts/run-migration.js
```

---

## Option 4: Using pgAdmin or DBeaver (External Tool)

If you prefer using a GUI tool:

1. **Get your database connection details from Render**
   - Go to your PostgreSQL service
   - Click **"Connect"** or **"Info"**
   - Copy the connection details:
     - Host
     - Port
     - Database name
     - Username
     - Password

2. **Connect using pgAdmin or DBeaver**
   - Use the connection details from Render
   - Connect to the database

3. **Run the migration SQL**
   - Open a new query window
   - Copy-paste the contents of `safe-migration-add-islegacy.sql`
   - Execute the query

---

## Option 5: Add Migration to Your Deployment (Advanced)

You can add a migration step to your build process:

### Update `server/package.json`:

```json
{
  "scripts": {
    "migrate": "node -r ts-node/register scripts/run-migration.ts",
    "postdeploy": "npm run migrate"
  }
}
```

**Note:** Be careful with this approach - only use it if you want migrations to run automatically on every deploy.

---

## Recommended Approach for Render

**I recommend Option 1 (Render Shell)** because:
- ✅ Easiest and most straightforward
- ✅ Direct access to your database
- ✅ Can see output immediately
- ✅ No code changes needed
- ✅ Safe - you control when it runs

---

## Step-by-Step: Render Shell Method

1. **Login to Render Dashboard**
   - https://dashboard.render.com

2. **Navigate to your PostgreSQL service**
   - Click on your database service

3. **Open Shell/Console**
   - Look for "Shell" tab or "Connect" → "Shell"

4. **Connect to database**
   ```bash
   psql $DATABASE_URL
   ```

5. **Run the migration SQL**
   - Copy the entire contents of `safe-migration-add-islegacy.sql`
   - Paste into the shell
   - Press Enter

6. **Verify results**
   - Check the NOTICE messages
   - Run the verification queries

7. **Done!** ✅

---

## Safety Checklist

Before running on production:

- [ ] **Backup your database** (Render provides automatic backups, but create a manual one if needed)
- [ ] **Test on a staging database first** (if you have one)
- [ ] **Review the SQL** to understand what it does
- [ ] **Run during low-traffic period** (if possible)
- [ ] **Monitor your application** after migration

---

## Troubleshooting

### If you get "permission denied":
- Make sure you're using the correct database user
- Check that you have the right permissions

### If connection fails:
- Verify your DATABASE_URL is correct
- Check Render's status page for any outages
- Ensure your IP is whitelisted (if required)

### If migration partially fails:
- The script uses `IF NOT EXISTS` checks, so it's safe to re-run
- Check the error message and fix the issue
- Re-run the migration

---

## After Migration

1. **Restart your backend service** (if needed)
   - Render usually auto-restarts, but you can manually restart from the dashboard

2. **Test your application**
   - Create a new invoice
   - Create a receipt
   - Verify everything works

3. **Monitor logs**
   - Check your backend logs for any errors
   - Verify the constraint error is gone

---

## Summary

**Easiest Method:**
1. Go to Render Dashboard → Your PostgreSQL Service → Shell
2. Run `psql $DATABASE_URL`
3. Copy-paste the SQL from `safe-migration-add-islegacy.sql`
4. Verify results
5. Done! ✅

The migration is safe to run multiple times - it uses `IF NOT EXISTS` checks, so it won't break if run again.

