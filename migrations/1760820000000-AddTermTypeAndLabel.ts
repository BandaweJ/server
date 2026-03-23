import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTermTypeAndLabel1760820000000 implements MigrationInterface {
  name = 'AddTermTypeAndLabel1760820000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "terms"
      ADD COLUMN IF NOT EXISTS "type" character varying(20) NOT NULL DEFAULT 'regular'
    `);

    await queryRunner.query(`
      ALTER TABLE "terms"
      ADD COLUMN IF NOT EXISTS "label" character varying(120)
    `);

    await queryRunner.query(`
      UPDATE "terms"
      SET "type" = 'regular'
      WHERE "type" IS NULL OR trim("type") = ''
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "terms"
      DROP COLUMN IF EXISTS "label"
    `);

    await queryRunner.query(`
      ALTER TABLE "terms"
      DROP COLUMN IF EXISTS "type"
    `);
  }
}

