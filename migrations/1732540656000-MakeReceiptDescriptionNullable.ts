import { MigrationInterface, QueryRunner } from "typeorm";

export class MakeReceiptDescriptionNullable1732540656000 implements MigrationInterface {
    name = 'MakeReceiptDescriptionNullable1732540656000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Remove NOT NULL constraint from description column in receipts table
        await queryRunner.query(`ALTER TABLE "receipts" ALTER COLUMN "description" DROP NOT NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Add back NOT NULL constraint (note: this will fail if there are NULL values)
        // First update any NULL values to empty string
        await queryRunner.query(`UPDATE "receipts" SET "description" = '' WHERE "description" IS NULL`);
        // Then add NOT NULL constraint
        await queryRunner.query(`ALTER TABLE "receipts" ALTER COLUMN "description" SET NOT NULL`);
    }
}



