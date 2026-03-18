import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateLibraryTextbooks1760790000000 implements MigrationInterface {
  name = 'CreateLibraryTextbooks1760790000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'textbook_copy_status') THEN
          CREATE TYPE "textbook_copy_status" AS ENUM (
            'available',
            'borrowed',
            'lost',
            'damaged',
            'archived'
          );
        END IF;
      END $$;`,
    );

    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "textbook_titles" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "title" character varying NOT NULL,
        "author" character varying,
        "edition" character varying,
        "isbn" character varying,
        "publisher" character varying,
        "subject" character varying,
        "notes" character varying,
        CONSTRAINT "PK_textbook_titles_id" PRIMARY KEY ("id")
      )`,
    );

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_textbook_titles_title" ON "textbook_titles" ("title")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_textbook_titles_author" ON "textbook_titles" ("author")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_textbook_titles_isbn" ON "textbook_titles" ("isbn")`,
    );

    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "textbook_copies" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "bookNumber" character varying NOT NULL,
        "titleId" uuid NOT NULL,
        "departmentId" uuid NOT NULL,
        "roomId" uuid,
        "status" "textbook_copy_status" NOT NULL DEFAULT 'available',
        "assignedTeacherId" character varying,
        CONSTRAINT "PK_textbook_copies_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_textbook_copies_bookNumber" UNIQUE ("bookNumber")
      )`,
    );

    await queryRunner.query(
      `DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_textbook_copies_title') THEN
          ALTER TABLE "textbook_copies"
          ADD CONSTRAINT "FK_textbook_copies_title"
          FOREIGN KEY ("titleId") REFERENCES "textbook_titles"("id")
          ON DELETE RESTRICT ON UPDATE NO ACTION;
        END IF;
      END $$;`,
    );

    await queryRunner.query(
      `DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_textbook_copies_department') THEN
          ALTER TABLE "textbook_copies"
          ADD CONSTRAINT "FK_textbook_copies_department"
          FOREIGN KEY ("departmentId") REFERENCES "departments"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION;
        END IF;
      END $$;`,
    );

    await queryRunner.query(
      `DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_textbook_copies_room') THEN
          ALTER TABLE "textbook_copies"
          ADD CONSTRAINT "FK_textbook_copies_room"
          FOREIGN KEY ("roomId") REFERENCES "rooms"("id")
          ON DELETE SET NULL ON UPDATE NO ACTION;
        END IF;
      END $$;`,
    );

    await queryRunner.query(
      `DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_textbook_copies_assignedTeacher') THEN
          ALTER TABLE "textbook_copies"
          ADD CONSTRAINT "FK_textbook_copies_assignedTeacher"
          FOREIGN KEY ("assignedTeacherId") REFERENCES "teachers"("id")
          ON DELETE SET NULL ON UPDATE NO ACTION;
        END IF;
      END $$;`,
    );

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_textbook_copies_bookNumber" ON "textbook_copies" ("bookNumber")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_textbook_copies_titleId" ON "textbook_copies" ("titleId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_textbook_copies_departmentId" ON "textbook_copies" ("departmentId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_textbook_copies_roomId" ON "textbook_copies" ("roomId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_textbook_copies_status" ON "textbook_copies" ("status")`,
    );

    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "textbook_loans" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "copyId" uuid NOT NULL,
        "studentNumber" character varying NOT NULL,
        "borrowedAt" TIMESTAMP NOT NULL,
        "dueAt" TIMESTAMP NOT NULL,
        "returnedAt" TIMESTAMP,
        "issuedByTeacherId" character varying NOT NULL,
        "receivedByTeacherId" character varying,
        "notes" character varying,
        CONSTRAINT "PK_textbook_loans_id" PRIMARY KEY ("id")
      )`,
    );

    await queryRunner.query(
      `DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_textbook_loans_copy') THEN
          ALTER TABLE "textbook_loans"
          ADD CONSTRAINT "FK_textbook_loans_copy"
          FOREIGN KEY ("copyId") REFERENCES "textbook_copies"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION;
        END IF;
      END $$;`,
    );

    await queryRunner.query(
      `DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_textbook_loans_student') THEN
          ALTER TABLE "textbook_loans"
          ADD CONSTRAINT "FK_textbook_loans_student"
          FOREIGN KEY ("studentNumber") REFERENCES "students"("studentNumber")
          ON DELETE CASCADE ON UPDATE NO ACTION;
        END IF;
      END $$;`,
    );

    await queryRunner.query(
      `DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_textbook_loans_issuedBy') THEN
          ALTER TABLE "textbook_loans"
          ADD CONSTRAINT "FK_textbook_loans_issuedBy"
          FOREIGN KEY ("issuedByTeacherId") REFERENCES "teachers"("id")
          ON DELETE RESTRICT ON UPDATE NO ACTION;
        END IF;
      END $$;`,
    );

    await queryRunner.query(
      `DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_textbook_loans_receivedBy') THEN
          ALTER TABLE "textbook_loans"
          ADD CONSTRAINT "FK_textbook_loans_receivedBy"
          FOREIGN KEY ("receivedByTeacherId") REFERENCES "teachers"("id")
          ON DELETE RESTRICT ON UPDATE NO ACTION;
        END IF;
      END $$;`,
    );

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_textbook_loans_copyId" ON "textbook_loans" ("copyId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_textbook_loans_studentNumber" ON "textbook_loans" ("studentNumber")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_textbook_loans_dueAt" ON "textbook_loans" ("dueAt")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Intentionally no-op (safe migration style used in this project).
  }
}

