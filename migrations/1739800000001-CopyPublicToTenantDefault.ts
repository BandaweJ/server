import { MigrationInterface, QueryRunner } from 'typeorm';

const TENANT_SCHEMA = 'tenant_default';
const EXCLUDED_TABLES = ['tenants', 'typeorm_migrations'];

export class CopyPublicToTenantDefault1739800000001 implements MigrationInterface {
  name = 'CopyPublicToTenantDefault1739800000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Get all tables in public (except excluded)
    const tablesRaw = await queryRunner.query(`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public' AND tablename != ALL($1::text[])
      ORDER BY tablename
    `, [EXCLUDED_TABLES]) as { tablename: string }[];
    const tables = tablesRaw.map((r) => r.tablename);

    for (const table of tables) {
      const quoted = `"${table}"`;
      // Create table structure (no FK to allow copy; we'll add FKs after)
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS ${TENANT_SCHEMA}.${quoted}
        (LIKE public.${quoted} INCLUDING DEFAULTS INCLUDING INDEXES)
      `);
      // Copy data
      const countRaw = await queryRunner.query(
        `SELECT COUNT(*) as c FROM public.${quoted}`,
      ) as { c: string }[];
      const count = parseInt(countRaw[0]?.c ?? '0', 10);
      if (count > 0) {
        await queryRunner.query(`
          INSERT INTO ${TENANT_SCHEMA}.${quoted}
          SELECT * FROM public.${quoted}
        `);
      }
    }

    // Re-add foreign key constraints pointing to tenant_default
    const fkResult = (await queryRunner.query(`
      SELECT
        c.conname,
        (SELECT relname FROM pg_class WHERE oid = c.conrelid) AS from_table,
        pg_get_constraintdef(c.oid) AS def
      FROM pg_constraint c
      JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE c.contype = 'f' AND n.nspname = 'public'
    `)) as { conname: string; from_table: string; def: string }[];

    for (const fk of fkResult) {
      if (EXCLUDED_TABLES.includes(fk.from_table)) continue;
      // Qualify REFERENCES with tenant_default schema (avoid double qualify)
      let def = fk.def;
      def = def.replace(/REFERENCES\s+public\./gi, 'REFERENCES ' + TENANT_SCHEMA + '.');
      def = def.replace(/REFERENCES\s+([a-z_][a-z0-9_]*)\s*\(/gi, (_, tbl) =>
        tbl === TENANT_SCHEMA ? `REFERENCES ${tbl} (` : `REFERENCES ${TENANT_SCHEMA}.${tbl} (`,
      );
      const alterSql = `ALTER TABLE ${TENANT_SCHEMA}."${fk.from_table}" ADD CONSTRAINT "${fk.conname}" ${def}`;
      try {
        await queryRunner.query(alterSql);
      } catch (err) {
        // Constraint might already exist or reference missing table; log and continue
        console.warn(`Could not add FK ${fk.conname} on ${fk.from_table}:`, err);
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const tablesResult = (await queryRunner.query(`
      SELECT tablename FROM pg_tables
      WHERE schemaname = $1
      ORDER BY tablename
    `, [TENANT_SCHEMA])) as { tablename: string }[];

    for (const row of tablesResult) {
      await queryRunner.query(
        `DROP TABLE IF EXISTS ${TENANT_SCHEMA}."${row.tablename}" CASCADE`,
      );
    }
  }
}
