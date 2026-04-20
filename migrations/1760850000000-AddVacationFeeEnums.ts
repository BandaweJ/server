import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddVacationFeeEnums1760850000000 implements MigrationInterface {
  name = 'AddVacationFeeEnums1760850000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'fees_name_enum') THEN
          IF NOT EXISTS (
            SELECT 1 FROM pg_type t
            JOIN pg_enum e ON e.enumtypid = t.oid
            WHERE t.typname = 'fees_name_enum'
              AND e.enumlabel = 'vacationTuitionDay'
          ) THEN
            ALTER TYPE "fees_name_enum" ADD VALUE 'vacationTuitionDay';
          END IF;

          IF NOT EXISTS (
            SELECT 1 FROM pg_type t
            JOIN pg_enum e ON e.enumtypid = t.oid
            WHERE t.typname = 'fees_name_enum'
              AND e.enumlabel = 'vacationTuitionBoarder'
          ) THEN
            ALTER TYPE "fees_name_enum" ADD VALUE 'vacationTuitionBoarder';
          END IF;

        END IF;
      END
      $$;
    `);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // Postgres enum values cannot be safely removed in-place.
  }
}
