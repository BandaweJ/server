-- AddDepartmentHodAndSubjects: run this if you cannot use TypeORM in Render Shell
-- Safe to run multiple times (IF NOT EXISTS / DO blocks).

-- 1. Add hodId to departments (nullable)
ALTER TABLE "departments" ADD COLUMN IF NOT EXISTS "hodId" character varying;

-- 2. FK departments.hodId -> teachers(id)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'FK_departments_hod_teacher'
  ) THEN
    ALTER TABLE "departments"
    ADD CONSTRAINT "FK_departments_hod_teacher"
    FOREIGN KEY ("hodId") REFERENCES "teachers"("id")
    ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
END $$;

-- 3. Create join table department_subjects
CREATE TABLE IF NOT EXISTS "department_subjects" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "departmentId" uuid NOT NULL,
  "subjectCode" character varying NOT NULL,
  CONSTRAINT "PK_department_subjects_id" PRIMARY KEY ("id"),
  CONSTRAINT "UQ_department_subjects_department_subject" UNIQUE ("departmentId", "subjectCode")
);

-- 4. FK department_subjects.departmentId -> departments(id)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'FK_department_subjects_department'
  ) THEN
    ALTER TABLE "department_subjects"
    ADD CONSTRAINT "FK_department_subjects_department"
    FOREIGN KEY ("departmentId") REFERENCES "departments"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;
END $$;

-- 5. FK department_subjects.subjectCode -> subjects(code)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'FK_department_subjects_subject'
  ) THEN
    ALTER TABLE "department_subjects"
    ADD CONSTRAINT "FK_department_subjects_subject"
    FOREIGN KEY ("subjectCode") REFERENCES "subjects"("code")
    ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;
END $$;
