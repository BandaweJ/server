import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateInvoiceCharges1760810000000 implements MigrationInterface {
  name = 'CreateInvoiceCharges1760810000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'invoice_charge_status') THEN
          CREATE TYPE "invoice_charge_status" AS ENUM (
            'pending_invoicing',
            'invoiced',
            'voided'
          );
        END IF;
      END $$;`,
    );

    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "invoice_charges" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "studentNumber" character varying NOT NULL,
        "enrolId" integer NOT NULL,
        "invoiceId" integer,
        "amount" numeric(12,2) NOT NULL,
        "description" character varying NOT NULL,
        "sourceType" character varying,
        "sourceId" character varying,
        "status" "invoice_charge_status" NOT NULL DEFAULT 'pending_invoicing',
        "isVoided" boolean NOT NULL DEFAULT false,
        CONSTRAINT "PK_invoice_charges_id" PRIMARY KEY ("id")
      )`,
    );

    await queryRunner.query(
      `DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_invoice_charges_student') THEN
          ALTER TABLE "invoice_charges"
          ADD CONSTRAINT "FK_invoice_charges_student"
          FOREIGN KEY ("studentNumber") REFERENCES "students"("studentNumber")
          ON DELETE CASCADE ON UPDATE NO ACTION;
        END IF;
      END $$;`,
    );

    await queryRunner.query(
      `DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_invoice_charges_enrol') THEN
          ALTER TABLE "invoice_charges"
          ADD CONSTRAINT "FK_invoice_charges_enrol"
          FOREIGN KEY ("enrolId") REFERENCES "enrol"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION;
        END IF;
      END $$;`,
    );

    await queryRunner.query(
      `DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_invoice_charges_invoice') THEN
          ALTER TABLE "invoice_charges"
          ADD CONSTRAINT "FK_invoice_charges_invoice"
          FOREIGN KEY ("invoiceId") REFERENCES "invoice"("id")
          ON DELETE SET NULL ON UPDATE NO ACTION;
        END IF;
      END $$;`,
    );

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_invoice_charges_studentNumber" ON "invoice_charges" ("studentNumber")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_invoice_charges_enrolId" ON "invoice_charges" ("enrolId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_invoice_charges_invoiceId" ON "invoice_charges" ("invoiceId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_invoice_charges_status" ON "invoice_charges" ("status")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_invoice_charges_sourceId" ON "invoice_charges" ("sourceId")`,
    );
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // no-op
  }
}

