# Step-by-Step: Running Migration on Render

## 📋 Order of Operations

### Step 1: Push Your Code Changes First ✅
1. **Commit your changes** (the `isLegacy` field in `InvoiceEntity`)
2. **Push to your repository** (GitHub/GitLab/etc.)
3. **Wait for Render to deploy** your backend service
4. **Then run the migration** (Step 2)

**Why this order?**
- Your code needs to know about the `isLegacy` field
- The migration adds the database column
- Both need to be in sync

---

## 🔍 Finding the Shell/Console in Render

The Shell option might be in different places depending on Render's UI:

### Method 1: Look for "Connect" Button
1. On your PostgreSQL service page (where you see "Info")
2. Look for the **"Connect"** button (you mentioned seeing it)
3. Click the dropdown arrow next to "Connect"
4. You should see options like:
   - **"Shell"** or **"Console"**
   - "External Connection"
   - "Internal Connection"

### Method 2: Check the Sidebar
1. In the left sidebar, look for sections like:
   - **"MANAGE"** → might have "Shell" or "Console"
   - **"MONITOR"** → might have "Shell"
   - Or a direct "Shell" link

### Method 3: Use External Connection (Alternative)
If you can't find Shell, you can use an external database client:

1. Click **"Connect"** → **"External Connection"**
2. Copy the connection string or details
3. Use a tool like:
   - **pgAdmin** (desktop app)
   - **DBeaver** (desktop app)
   - **TablePlus** (desktop app)
   - **psql** from your local terminal

---

## 🚀 Recommended Approach: Use External Connection

Since you can't find the Shell tab, here's the easiest alternative:

### Option A: Use psql from Your Local Machine

1. **Get Connection Details from Render:**
   - Click **"Connect"** on your PostgreSQL service
   - Copy the **"External Connection"** string
   - It will look like: `postgresql://user:password@host:port/database`

2. **Run the migration from your local machine:**
   ```bash
   cd /home/bandawe/Documents/Projects/school-junior/server
   
   # If you have the connection string:
   psql "postgresql://user:password@host:port/database" -f render-migration-script.sql
   
   # Or if you want to set it as an environment variable:
   export RENDER_DB_URL="postgresql://user:password@host:port/database"
   psql "$RENDER_DB_URL" -f render-migration-script.sql
   ```

### Option B: Use a Database GUI Tool

1. **Install pgAdmin or DBeaver** (free, popular tools)
2. **Get connection details from Render:**
   - Click "Connect" → "External Connection"
   - Note down:
     - Host
     - Port
     - Database name
     - Username
     - Password

3. **Connect to your Render database:**
   - Open pgAdmin/DBeaver
   - Create new connection
   - Enter the details from Render

4. **Run the migration:**
   - Open a new SQL query window
   - Copy-paste contents of `server/render-migration-script.sql`
   - Execute

---

## 📝 Complete Workflow

### 1. First: Push Code Changes
```bash
# In your local project
cd /home/bandawe/Documents/Projects/school-junior

# Commit your changes
git add server/src/payment/entities/invoice.entity.ts
git commit -m "Add isLegacy field to InvoiceEntity for historical invoices"

# Push to your repository
git push origin main  # or your branch name
```

### 2. Wait for Render to Deploy
- Go to your **Backend Web Service** on Render
- Wait for the deployment to complete (usually 2-5 minutes)
- Check that deployment status is "Live"

### 3. Then: Run the Migration

**Using psql from local machine:**
```bash
# Get connection string from Render Dashboard
# Click: PostgreSQL Service → Connect → External Connection
# Copy the connection string

# Run migration
cd /home/bandawe/Documents/Projects/school-junior/server
psql "YOUR_CONNECTION_STRING_HERE" -f render-migration-script.sql
```

**Or using a GUI tool:**
- Connect to Render database using connection details
- Run the SQL from `render-migration-script.sql`

### 4. Verify Migration
After running, you should see:
- ✅ "Column isLegacy added successfully"
- ✅ "Total legacy invoices: X"
- ✅ "New constraint added successfully"
- ✅ Verification queries showing 0 violating invoices

### 5. Restart Backend (if needed)
- Render usually auto-restarts, but you can manually restart from the dashboard
- Go to your Backend Web Service → "Manual Deploy" → "Deploy latest commit"

---

## 🔧 Alternative: Create a Migration Endpoint (Advanced)

If you can't access the database directly, you can create a temporary migration endpoint:

### Create `server/src/payment/payment.controller.ts` (add this method):

```typescript
@Post('migrate/add-islegacy')
@Roles(ROLES.director) // Only directors can run this
async runIsLegacyMigration(@GetUser() profile: TeachersEntity) {
  return this.paymentService.runIsLegacyMigration(profile.email);
}
```

### Create `server/src/payment/payment.service.ts` (add this method):

```typescript
async runIsLegacyMigration(performedBy: string): Promise<any> {
  return this.dataSource.transaction(async (manager) => {
    // Add column
    await manager.query(`
      DO $$
      BEGIN
          IF NOT EXISTS (
              SELECT 1 FROM information_schema.columns 
              WHERE table_name = 'invoice' AND column_name = 'isLegacy'
          ) THEN
              ALTER TABLE invoice ADD COLUMN "isLegacy" boolean NOT NULL DEFAULT false;
          END IF;
      END $$;
    `);

    // Mark legacy invoices
    await manager.query(`
      UPDATE invoice
      SET "isLegacy" = true
      WHERE balance < 0 
        AND ("isVoided" = false OR "isVoided" IS NULL)
        AND "isLegacy" = false;
    `);

    // Update constraint (drop old, add new)
    // ... (full SQL from render-migration-script.sql)

    return { success: true, message: 'Migration completed' };
  });
}
```

Then call: `POST https://your-backend.onrender.com/payment/migrate/add-islegacy`

**Note:** Remove this endpoint after migration for security!

---

## ✅ Summary

1. ✅ **Push code first** (with `isLegacy` field)
2. ✅ **Wait for deployment**
3. ✅ **Run migration** using:
   - External connection + psql (recommended)
   - Database GUI tool (pgAdmin/DBeaver)
   - Or temporary migration endpoint
4. ✅ **Verify results**
5. ✅ **Done!**

The migration is safe and can be run multiple times if needed.



