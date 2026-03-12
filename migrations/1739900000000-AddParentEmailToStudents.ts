import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Ensures students table has parentEmail FK column for parent–student linking.
 * TypeORM expects this column for the ManyToOne relation to parents.email.
 */
export class AddParentEmailToStudents1739900000000 implements MigrationInterface {
  name = 'AddParentEmailToStudents1739900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = 'tenant_default';
    const table = `${schema}.students`;
    const column = 'parentEmail';
    const parentTable = `${schema}.parents`;

    // Add column if it doesn't exist (PostgreSQL)
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = '${schema}' AND table_name = 'students' AND column_name = '${column}'
        ) THEN
          ALTER TABLE ${table} ADD COLUMN "${column}" varchar;
        END IF;
      END $$
    `);

    // Add FK constraint if it doesn't exist (so DB enforces referential integrity)
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_schema = '${schema}' AND table_name = 'students'
          AND constraint_name = 'FK_students_parent'
        ) THEN
          ALTER TABLE ${table}
          ADD CONSTRAINT "FK_students_parent"
          FOREIGN KEY ("${column}") REFERENCES ${parentTable}("email")
          ON DELETE SET NULL;
        END IF;
      END $$
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema = 'tenant_default';
    const table = `${schema}.students`;
    const column = 'parentEmail';

    await queryRunner.query(
      `ALTER TABLE ${table} DROP CONSTRAINT IF EXISTS "FK_students_parent"`,
    );
    await queryRunner.query(
      `ALTER TABLE ${table} DROP COLUMN IF EXISTS "${column}"`,
    );
  }
}
