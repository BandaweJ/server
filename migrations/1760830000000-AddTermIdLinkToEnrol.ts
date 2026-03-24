import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTermIdLinkToEnrol1760830000000 implements MigrationInterface {
  name = 'AddTermIdLinkToEnrol1760830000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "terms"
      ADD COLUMN IF NOT EXISTS "id" SERIAL
    `);

    await queryRunner.query(`
      ALTER TABLE "terms"
      ADD CONSTRAINT "UQ_terms_id" UNIQUE ("id")
    `).catch(() => undefined);

    await queryRunner.query(`
      ALTER TABLE "enrol"
      ADD COLUMN IF NOT EXISTS "termId" integer
    `);
    await queryRunner.query(`
      ALTER TABLE "marks"
      ADD COLUMN IF NOT EXISTS "termId" integer
    `);
    await queryRunner.query(`
      ALTER TABLE "reports"
      ADD COLUMN IF NOT EXISTS "termId" integer
    `);

    await queryRunner.query(`
      UPDATE "enrol" e
      SET "termId" = t."id"
      FROM "terms" t
      WHERE e."num" = t."num" AND e."year" = t."year" AND e."termId" IS NULL
    `);
    await queryRunner.query(`
      UPDATE "marks" m
      SET "termId" = t."id"
      FROM "terms" t
      WHERE m."num" = t."num" AND m."year" = t."year" AND m."termId" IS NULL
    `);
    await queryRunner.query(`
      UPDATE "reports" r
      SET "termId" = t."id"
      FROM "terms" t
      WHERE r."num" = t."num" AND r."year" = t."year" AND r."termId" IS NULL
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_enrol_termId" ON "enrol" ("termId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_marks_termId" ON "marks" ("termId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_reports_termId" ON "reports" ("termId")
    `);

    await queryRunner.query(`
      ALTER TABLE "enrol"
      ADD CONSTRAINT "FK_enrol_termId_terms_id"
      FOREIGN KEY ("termId") REFERENCES "terms"("id")
      ON DELETE SET NULL ON UPDATE CASCADE
    `).catch(() => undefined);
    await queryRunner.query(`
      ALTER TABLE "marks"
      ADD CONSTRAINT "FK_marks_termId_terms_id"
      FOREIGN KEY ("termId") REFERENCES "terms"("id")
      ON DELETE SET NULL ON UPDATE CASCADE
    `).catch(() => undefined);
    await queryRunner.query(`
      ALTER TABLE "reports"
      ADD CONSTRAINT "FK_reports_termId_terms_id"
      FOREIGN KEY ("termId") REFERENCES "terms"("id")
      ON DELETE SET NULL ON UPDATE CASCADE
    `).catch(() => undefined);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "enrol" DROP CONSTRAINT IF EXISTS "FK_enrol_termId_terms_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "marks" DROP CONSTRAINT IF EXISTS "FK_marks_termId_terms_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "reports" DROP CONSTRAINT IF EXISTS "FK_reports_termId_terms_id"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_enrol_termId"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_marks_termId"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_reports_termId"
    `);
    await queryRunner.query(`
      ALTER TABLE "enrol" DROP COLUMN IF EXISTS "termId"
    `);
    await queryRunner.query(`
      ALTER TABLE "marks" DROP COLUMN IF EXISTS "termId"
    `);
    await queryRunner.query(`
      ALTER TABLE "reports" DROP COLUMN IF EXISTS "termId"
    `);
    await queryRunner.query(`
      ALTER TABLE "terms" DROP CONSTRAINT IF EXISTS "UQ_terms_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "terms" DROP COLUMN IF EXISTS "id"
    `);
  }
}

