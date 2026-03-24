import { MigrationInterface, QueryRunner } from 'typeorm';

export class SyncTermsIdSequence1760840000000 implements MigrationInterface {
  name = 'SyncTermsIdSequence1760840000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      SELECT setval(
        pg_get_serial_sequence('"terms"', 'id'),
        COALESCE((SELECT MAX("id") FROM "terms"), 0),
        true
      )
    `);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // no-op: sequence synchronization is safe and does not need rollback
  }
}

