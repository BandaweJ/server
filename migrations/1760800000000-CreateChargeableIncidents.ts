import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateChargeableIncidents1760800000000
  implements MigrationInterface
{
  name = 'CreateChargeableIncidents1760800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'incident_type') THEN
          CREATE TYPE "incident_type" AS ENUM (
            'lost_book',
            'damaged_book',
            'broken_furniture',
            'broken_window',
            'broken_lab_utensil',
            'other'
          );
        END IF;
      END $$;`,
    );

    await queryRunner.query(
      `DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'incident_status') THEN
          CREATE TYPE "incident_status" AS ENUM (
            'submitted',
            'hod_confirmed',
            'deputy_signed',
            'head_signed',
            'accepted',
            'rejected'
          );
        END IF;
      END $$;`,
    );

    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "chargeable_incidents" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "type" "incident_type" NOT NULL,
        "departmentId" uuid NOT NULL,
        "roomId" uuid,
        "reportedByTeacherId" uuid NOT NULL,
        "studentNumber" character varying,
        "description" character varying NOT NULL,
        "replacementCost" numeric(12,2) NOT NULL,
        "status" "incident_status" NOT NULL DEFAULT 'submitted',
        "textbookCopyId" uuid,
        "inventoryItemId" uuid,
        "hodConfirmedAt" TIMESTAMP,
        "hodConfirmedById" uuid,
        "deputySignedAt" TIMESTAMP,
        "deputySignedById" uuid,
        "headSignedAt" TIMESTAMP,
        "headSignedById" uuid,
        "acceptedAt" TIMESTAMP,
        "acceptedById" uuid,
        "rejectedAt" TIMESTAMP,
        "rejectedById" uuid,
        "rejectionReason" character varying,
        CONSTRAINT "PK_chargeable_incidents_id" PRIMARY KEY ("id")
      )`,
    );

    await queryRunner.query(
      `DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_incidents_department') THEN
          ALTER TABLE "chargeable_incidents"
          ADD CONSTRAINT "FK_incidents_department"
          FOREIGN KEY ("departmentId") REFERENCES "departments"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION;
        END IF;
      END $$;`,
    );

    await queryRunner.query(
      `DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_incidents_room') THEN
          ALTER TABLE "chargeable_incidents"
          ADD CONSTRAINT "FK_incidents_room"
          FOREIGN KEY ("roomId") REFERENCES "rooms"("id")
          ON DELETE SET NULL ON UPDATE NO ACTION;
        END IF;
      END $$;`,
    );

    await queryRunner.query(
      `DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_incidents_reportedBy') THEN
          ALTER TABLE "chargeable_incidents"
          ADD CONSTRAINT "FK_incidents_reportedBy"
          FOREIGN KEY ("reportedByTeacherId") REFERENCES "teachers"("id")
          ON DELETE RESTRICT ON UPDATE NO ACTION;
        END IF;
      END $$;`,
    );

    await queryRunner.query(
      `DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_incidents_student') THEN
          ALTER TABLE "chargeable_incidents"
          ADD CONSTRAINT "FK_incidents_student"
          FOREIGN KEY ("studentNumber") REFERENCES "students"("studentNumber")
          ON DELETE CASCADE ON UPDATE NO ACTION;
        END IF;
      END $$;`,
    );

    await queryRunner.query(
      `DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_incidents_textbookCopy') THEN
          ALTER TABLE "chargeable_incidents"
          ADD CONSTRAINT "FK_incidents_textbookCopy"
          FOREIGN KEY ("textbookCopyId") REFERENCES "textbook_copies"("id")
          ON DELETE SET NULL ON UPDATE NO ACTION;
        END IF;
      END $$;`,
    );

    await queryRunner.query(
      `DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_incidents_inventoryItem') THEN
          ALTER TABLE "chargeable_incidents"
          ADD CONSTRAINT "FK_incidents_inventoryItem"
          FOREIGN KEY ("inventoryItemId") REFERENCES "inventory_items"("id")
          ON DELETE SET NULL ON UPDATE NO ACTION;
        END IF;
      END $$;`,
    );

    const approvalFks = [
      ['hodConfirmedById', 'FK_incidents_hodConfirmedBy'],
      ['deputySignedById', 'FK_incidents_deputySignedBy'],
      ['headSignedById', 'FK_incidents_headSignedBy'],
      ['acceptedById', 'FK_incidents_acceptedBy'],
      ['rejectedById', 'FK_incidents_rejectedBy'],
    ] as const;

    for (const [col, fk] of approvalFks) {
      await queryRunner.query(
        `DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '${fk}') THEN
            ALTER TABLE "chargeable_incidents"
            ADD CONSTRAINT "${fk}"
            FOREIGN KEY ("${col}") REFERENCES "teachers"("id")
            ON DELETE SET NULL ON UPDATE NO ACTION;
          END IF;
        END $$;`,
      );
    }

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_incidents_type" ON "chargeable_incidents" ("type")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_incidents_status" ON "chargeable_incidents" ("status")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_incidents_departmentId" ON "chargeable_incidents" ("departmentId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_incidents_reportedByTeacherId" ON "chargeable_incidents" ("reportedByTeacherId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_incidents_studentNumber" ON "chargeable_incidents" ("studentNumber")`,
    );
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // no-op (safe migration style)
  }
}

