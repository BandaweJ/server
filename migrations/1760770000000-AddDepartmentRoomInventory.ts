import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDepartmentRoomInventory1760770000000
  implements MigrationInterface
{
  name = 'AddDepartmentRoomInventory1760770000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Rooms (per department)
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "rooms" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "departmentId" uuid NOT NULL,
        "name" character varying NOT NULL,
        "code" character varying,
        "description" character varying,
        "isActive" boolean NOT NULL DEFAULT true,
        CONSTRAINT "PK_rooms_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_rooms_department_name" UNIQUE ("departmentId", "name")
      )`,
    );

    await queryRunner.query(
      `DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_rooms_department'
        ) THEN
          ALTER TABLE "rooms"
          ADD CONSTRAINT "FK_rooms_department"
          FOREIGN KEY ("departmentId") REFERENCES "departments"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION;
        END IF;
      END $$;`,
    );

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_rooms_departmentId" ON "rooms" ("departmentId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_rooms_isActive" ON "rooms" ("isActive")`,
    );

    // Inventory items (per room, with a denormalized departmentId for fast filtering)
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "inventory_items" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "departmentId" uuid NOT NULL,
        "roomId" uuid NOT NULL,
        "name" character varying NOT NULL,
        "category" character varying,
        "unit" character varying,
        "quantityOnHand" integer NOT NULL DEFAULT 0,
        "reorderLevel" integer,
        "notes" character varying,
        "isActive" boolean NOT NULL DEFAULT true,
        CONSTRAINT "PK_inventory_items_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_inventory_items_room_name" UNIQUE ("roomId", "name")
      )`,
    );

    await queryRunner.query(
      `DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_inventory_items_department'
        ) THEN
          ALTER TABLE "inventory_items"
          ADD CONSTRAINT "FK_inventory_items_department"
          FOREIGN KEY ("departmentId") REFERENCES "departments"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION;
        END IF;
      END $$;`,
    );

    await queryRunner.query(
      `DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_inventory_items_room'
        ) THEN
          ALTER TABLE "inventory_items"
          ADD CONSTRAINT "FK_inventory_items_room"
          FOREIGN KEY ("roomId") REFERENCES "rooms"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION;
        END IF;
      END $$;`,
    );

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_inventory_items_departmentId" ON "inventory_items" ("departmentId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_inventory_items_roomId" ON "inventory_items" ("roomId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_inventory_items_category" ON "inventory_items" ("category")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_inventory_items_isActive" ON "inventory_items" ("isActive")`,
    );

    // Adjustments (audit trail, immutable)
    await queryRunner.query(
      `DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_type WHERE typname = 'inventory_adjustment_reason'
        ) THEN
          CREATE TYPE "inventory_adjustment_reason" AS ENUM (
            'stocktake',
            'issue',
            'received',
            'transfer_in',
            'transfer_out',
            'correction'
          );
        END IF;
      END $$;`,
    );

    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "inventory_adjustments" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "inventoryItemId" uuid NOT NULL,
        "delta" integer NOT NULL,
        "reason" "inventory_adjustment_reason" NOT NULL,
        "reference" character varying,
        "notes" character varying,
        "createdByTeacherId" character varying NOT NULL,
        CONSTRAINT "PK_inventory_adjustments_id" PRIMARY KEY ("id")
      )`,
    );

    await queryRunner.query(
      `DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_inventory_adjustments_item'
        ) THEN
          ALTER TABLE "inventory_adjustments"
          ADD CONSTRAINT "FK_inventory_adjustments_item"
          FOREIGN KEY ("inventoryItemId") REFERENCES "inventory_items"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION;
        END IF;
      END $$;`,
    );

    await queryRunner.query(
      `DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_inventory_adjustments_teacher'
        ) THEN
          ALTER TABLE "inventory_adjustments"
          ADD CONSTRAINT "FK_inventory_adjustments_teacher"
          FOREIGN KEY ("createdByTeacherId") REFERENCES "teachers"("id")
          ON DELETE RESTRICT ON UPDATE NO ACTION;
        END IF;
      END $$;`,
    );

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_inventory_adjustments_inventoryItemId" ON "inventory_adjustments" ("inventoryItemId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_inventory_adjustments_createdByTeacherId" ON "inventory_adjustments" ("createdByTeacherId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_inventory_adjustments_createdAt" ON "inventory_adjustments" ("createdAt")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "inventory_adjustments" DROP CONSTRAINT IF EXISTS "FK_inventory_adjustments_teacher"`,
    );
    await queryRunner.query(
      `ALTER TABLE "inventory_adjustments" DROP CONSTRAINT IF EXISTS "FK_inventory_adjustments_item"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "inventory_adjustments"`);

    await queryRunner.query(
      `ALTER TABLE "inventory_items" DROP CONSTRAINT IF EXISTS "FK_inventory_items_room"`,
    );
    await queryRunner.query(
      `ALTER TABLE "inventory_items" DROP CONSTRAINT IF EXISTS "FK_inventory_items_department"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "inventory_items"`);

    await queryRunner.query(
      `ALTER TABLE "rooms" DROP CONSTRAINT IF EXISTS "FK_rooms_department"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "rooms"`);

    await queryRunner.query(
      `DO $$ BEGIN
        IF EXISTS (
          SELECT 1 FROM pg_type WHERE typname = 'inventory_adjustment_reason'
        ) THEN
          DROP TYPE "inventory_adjustment_reason";
        END IF;
      END $$;`,
    );
  }
}

