import { MigrationInterface, QueryRunner } from 'typeorm';

export class RepairNullEnrolTermIds1760900000000 implements MigrationInterface {
  name = 'RepairNullEnrolTermIds1760900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1) Safe backfill where num/year maps to exactly one term.
    await queryRunner.query(`
      UPDATE "enrol" e
      SET "termId" = t."id"
      FROM "terms" t
      WHERE
        e."termId" IS NULL
        AND e."num" = t."num"
        AND e."year" = t."year"
        AND (
          SELECT COUNT(*)
          FROM "terms" t2
          WHERE t2."num" = e."num" AND t2."year" = e."year"
        ) = 1
    `);

    // 2) Resolve ambiguous regular/vacation pairs:
    // If student already has REGULAR enrolment for same num/year,
    // map the NULL-term enrolment to VACATION (common class-migration case).
    await queryRunner.query(`
      UPDATE "enrol" e
      SET "termId" = tv."id"
      FROM "terms" tv
      WHERE
        e."termId" IS NULL
        AND tv."num" = e."num"
        AND tv."year" = e."year"
        AND tv."type" = 'vacation'
        AND EXISTS (
          SELECT 1
          FROM "enrol" er
          INNER JOIN "terms" tr ON tr."id" = er."termId"
          WHERE
            er."studentStudentNumber" = e."studentStudentNumber"
            AND tr."num" = e."num"
            AND tr."year" = e."year"
            AND tr."type" = 'regular'
        )
        AND NOT EXISTS (
          SELECT 1
          FROM "enrol" ev
          WHERE
            ev."studentStudentNumber" = e."studentStudentNumber"
            AND ev."termId" = tv."id"
        )
    `);

    // 3) Inverse case: if student already has VACATION enrolment for same num/year,
    // map NULL-term enrolment to REGULAR.
    await queryRunner.query(`
      UPDATE "enrol" e
      SET "termId" = tr."id"
      FROM "terms" tr
      WHERE
        e."termId" IS NULL
        AND tr."num" = e."num"
        AND tr."year" = e."year"
        AND tr."type" = 'regular'
        AND EXISTS (
          SELECT 1
          FROM "enrol" ev
          INNER JOIN "terms" tv ON tv."id" = ev."termId"
          WHERE
            ev."studentStudentNumber" = e."studentStudentNumber"
            AND tv."num" = e."num"
            AND tv."year" = e."year"
            AND tv."type" = 'vacation'
        )
        AND NOT EXISTS (
          SELECT 1
          FROM "enrol" er
          WHERE
            er."studentStudentNumber" = e."studentStudentNumber"
            AND er."termId" = tr."id"
        )
    `);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // Irreversible data repair migration.
  }
}

