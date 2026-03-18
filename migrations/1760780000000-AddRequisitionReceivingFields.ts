import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRequisitionReceivingFields1760780000000
  implements MigrationInterface
{
  name = 'AddRequisitionReceivingFields1760780000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "requisition_items" ADD COLUMN IF NOT EXISTS "receivedQuantity" numeric(10,2) NOT NULL DEFAULT 0`,
    );

    await queryRunner.query(
      `ALTER TABLE "requisitions" ADD COLUMN IF NOT EXISTS "receivedAt" timestamp`,
    );

    await queryRunner.query(
      `ALTER TABLE "requisitions" ADD COLUMN IF NOT EXISTS "receivedById" character varying`,
    );

    await queryRunner.query(
      `DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_requisitions_receivedBy_teacher'
        ) THEN
          ALTER TABLE "requisitions"
          ADD CONSTRAINT "FK_requisitions_receivedBy_teacher"
          FOREIGN KEY ("receivedById") REFERENCES "teachers"("id")
          ON DELETE SET NULL ON UPDATE NO ACTION;
        END IF;
      END $$;`,
    );

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_requisition_items_receivedQuantity" ON "requisition_items" ("receivedQuantity")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "requisitions" DROP CONSTRAINT IF EXISTS "FK_requisitions_receivedBy_teacher"`,
    );
    await queryRunner.query(
      `ALTER TABLE "requisitions" DROP COLUMN IF EXISTS "receivedById"`,
    );
    await queryRunner.query(
      `ALTER TABLE "requisitions" DROP COLUMN IF EXISTS "receivedAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "requisition_items" DROP COLUMN IF EXISTS "receivedQuantity"`,
    );
  }
}

