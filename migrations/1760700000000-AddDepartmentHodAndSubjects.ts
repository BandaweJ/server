import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDepartmentHodAndSubjects1760700000000
  implements MigrationInterface
{
  name = 'AddDepartmentHodAndSubjects1760700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add hodId to departments (nullable)
    await queryRunner.query(
      `ALTER TABLE "departments" ADD COLUMN IF NOT EXISTS "hodId" character varying`,
    );

    // FK to teachers(id). We don't cascade delete departments if a teacher is deleted;
    // instead, null out hodId.
    await queryRunner.query(
      `DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_departments_hod_teacher'
        ) THEN
          ALTER TABLE "departments"
          ADD CONSTRAINT "FK_departments_hod_teacher"
          FOREIGN KEY ("hodId") REFERENCES "teachers"("id")
          ON DELETE SET NULL ON UPDATE NO ACTION;
        END IF;
      END $$;`,
    );

    // Create join table for department-subject assignment
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "department_subjects" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "departmentId" uuid NOT NULL,
        "subjectCode" character varying NOT NULL,
        CONSTRAINT "PK_department_subjects_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_department_subjects_department_subject" UNIQUE ("departmentId", "subjectCode")
      )`,
    );

    // FK to departments(id)
    await queryRunner.query(
      `DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_department_subjects_department'
        ) THEN
          ALTER TABLE "department_subjects"
          ADD CONSTRAINT "FK_department_subjects_department"
          FOREIGN KEY ("departmentId") REFERENCES "departments"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION;
        END IF;
      END $$;`,
    );

    // FK to subjects(code)
    await queryRunner.query(
      `DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_department_subjects_subject'
        ) THEN
          ALTER TABLE "department_subjects"
          ADD CONSTRAINT "FK_department_subjects_subject"
          FOREIGN KEY ("subjectCode") REFERENCES "subjects"("code")
          ON DELETE CASCADE ON UPDATE NO ACTION;
        END IF;
      END $$;`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "department_subjects" DROP CONSTRAINT IF EXISTS "FK_department_subjects_subject"`,
    );
    await queryRunner.query(
      `ALTER TABLE "department_subjects" DROP CONSTRAINT IF EXISTS "FK_department_subjects_department"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "department_subjects"`);

    await queryRunner.query(
      `ALTER TABLE "departments" DROP CONSTRAINT IF EXISTS "FK_departments_hod_teacher"`,
    );
    await queryRunner.query(
      `ALTER TABLE "departments" DROP COLUMN IF EXISTS "hodId"`,
    );
  }
}

