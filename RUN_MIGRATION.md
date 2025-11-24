# Running Schema Migration on Render

## Quick Command

```bash
cd server
psql "postgresql://school_zbbz_user:dTgcQDeptWds5KCE90YGHi4TIOtBGJkl@dpg-co02nkicn0vc73ca4ltg-a.oregon-postgres.render.com/school_zbbz" -f render-schema-migration.sql
```

## What This Migration Does

This migration creates all the new database tables and enums needed for:

1. **Continuous Assessment System** - `continuous_assessments` table
2. **Messaging System** - `conversations`, `messages`, `conversation_participants`, `message_reads`, `message_attachments` tables
3. **Calendar System** - `calendar_events`, `event_notifications` tables
4. **System Settings** - `system_settings` table (with default row)
5. **Grading Systems** - `grading_systems` table
6. **Integrations** - `integrations` table

## Safety

- ✅ **Idempotent**: Safe to run multiple times
- ✅ **Non-destructive**: Only creates new tables, doesn't modify existing data
- ✅ **Checks before creating**: Uses `IF NOT EXISTS` checks for all objects

## After Running

1. The migration will output NOTICE messages for each table created
2. At the end, you'll see a summary of how many tables were created
3. Your app can now use all the new features!

## Troubleshooting

If you get connection errors:
- Make sure you're using the correct connection string
- Check that your IP is allowed (Render may require whitelisting)
- Try using SSL explicitly: Add `?sslmode=require` to the connection string

If tables already exist:
- The migration will skip them and continue - this is normal and safe

