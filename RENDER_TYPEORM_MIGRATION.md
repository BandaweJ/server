# TypeORM Migration Workflow for Render

Use this playbook anytime you need to sync entity changes to the managed
PostgreSQL instance on Render.

---

## 1. Prerequisites

| Requirement | Notes |
|-------------|-------|
| `server/typeorm.config.ts` | Already added – loads `.env` files locally and falls back to `DATABASE_URL`. |
| `dotenv` dependency | Installed and wired up. |
| Scripts | `migration:generate`, `migration:run`, `migration:revert` in `server/package.json`. |
| Node 18+ | Matches the Nest/TypeORM toolchain. |

---

## 2. Generate a migration locally

1. **Ensure your local DB is up‑to‑date** (`synchronize` can still be `true` in development to hydrate schema automatically).
2. From `server/`, run:

   ```bash
   npm install
   npm run migration:generate -- ./migrations/continuous_assessment
   ```

   - Replace `continuous_assessment` with a descriptive name.
   - TypeORM inspects the current schema vs entities and outputs a new file inside `server/migrations/`.
   - Review the generated SQL to make sure it only contains the expected operations.

3. Commit the migration file alongside the code change that requires it.

---

## 3. Run the migration against Render

You supplied this connection string:

```
postgresql://school_zbbz_user:dTgcQDeptWds5KCE90YGHi4TIOtBGJkl@dpg-co02nkicn0vc73ca4ltg-a.oregon-postgres.render.com/school_zbbz
```

### Option A – from your local terminal

```bash
cd /home/bandawe/Documents/Projects/school-junior/server
export DATABASE_URL="postgresql://school_zbbz_user:dTgcQDeptWds5KCE90YGHi4TIOtBGJkl@dpg-co02nkicn0vc73ca4ltg-a.oregon-postgres.render.com/school_zbbz"
npm run migration:run
```

### Option B – Render shell

1. Open the **Shell** tab for your backend service (or the database service) in the Render dashboard.
2. Run:

   ```bash
   cd /opt/render/project/src/server
   DATABASE_URL="postgresql://school_zbbz_user:dTgcQDeptWds5KCE90YGHi4TIOtBGJkl@dpg-co02nkicn0vc73ca4ltg-a.oregon-postgres.render.com/school_zbbz" npm run migration:run
   ```

Both approaches respect SSL because `typeorm.config.ts` enables `rejectUnauthorized: false` when `DATABASE_URL` is present.

---

## 4. Reverting (if necessary)

If the migration introduces an issue, revert the last run migration with the
same connection string:

```bash
DATABASE_URL="postgresql://..." npm run migration:revert
```

---

## 5. Best practices

- Run migrations in staging first whenever possible.
- Keep one migration per pull request so production deploys remain linear.
- Never enable `synchronize` in production – migrations are now the source of truth.
- If you need raw SQL (for data fixes), create a dedicated migration that executes the SQL via `queryRunner`.

---

## 6. Quick reference

| Action | Command |
|--------|---------|
| Generate migration | `npm run migration:generate -- ./migrations/<name>` |
| Run locally (dev DB) | `npm run migration:run` |
| Run against Render | `DATABASE_URL="<render-url>" npm run migration:run` |
| Revert last | `DATABASE_URL="<render-url>" npm run migration:revert` |

Feel free to copy the commands above into your automation docs or Render “Deploy Hooks” if you decide to run migrations automatically during deploys. For manual control, keep using the shell approach outlined here.

