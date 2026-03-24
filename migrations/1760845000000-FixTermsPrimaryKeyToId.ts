import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixTermsPrimaryKeyToId1760845000000 implements MigrationInterface {
  name = 'FixTermsPrimaryKeyToId1760845000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "terms"
      ADD COLUMN IF NOT EXISTS "id" SERIAL
    `);

    await queryRunner.query(`
      ALTER TABLE "terms"
      ALTER COLUMN "id" SET NOT NULL
    `);

    await queryRunner.query(`
      DO $$
      DECLARE
        pk_name text;
      BEGIN
        SELECT c.conname
          INTO pk_name
        FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        WHERE t.relname = 'terms' AND c.contype = 'p'
        LIMIT 1;

        IF pk_name IS NOT NULL THEN
          EXECUTE format('ALTER TABLE "terms" DROP CONSTRAINT %I', pk_name);
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      ALTER TABLE "terms"
      ADD CONSTRAINT "PK_terms_id" PRIMARY KEY ("id")
    `).catch(() => undefined);

    await queryRunner.query(`
      SELECT setval(
        pg_get_serial_sequence('"terms"', 'id'),
        COALESCE((SELECT MAX("id") FROM "terms"), 0),
        true
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "terms" DROP CONSTRAINT IF EXISTS "PK_terms_id"
    `);
  }
}

