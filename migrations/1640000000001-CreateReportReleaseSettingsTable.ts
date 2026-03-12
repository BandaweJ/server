import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateReportReleaseSettingsTable1640000000001
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'report_release_settings',
        columns: [
          {
            name: 'id',
            type: 'varchar',
            length: '36',
            generationStrategy: 'uuid',
            isPrimary: true,
          },
          {
            name: 'termNumber',
            type: 'int',
          },
          {
            name: 'termYear',
            type: 'int',
          },
          {
            name: 'examType',
            type: 'enum',
            enum: ['Mid Term', 'End Of Term'],
          },
          {
            name: 'isReleased',
            type: 'boolean',
            default: false,
          },
          {
            name: 'releaseDate',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'scheduledReleaseDate',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'releasedBy',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
          {
            name: 'releasedByUserId',
            type: 'varchar',
            length: '36',
            isNullable: true,
          },
          {
            name: 'releaseNotes',
            type: 'varchar',
            length: '500',
            isNullable: true,
          },
          {
            name: 'sendNotification',
            type: 'boolean',
            default: true,
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updatedAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            onUpdate: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true,
    );

    // Create indexes for better performance
    await queryRunner.createIndex(
      'report_release_settings',
      new TableIndex({
        name: 'IDX_REPORT_RELEASE_UNIQUE_SESSION',
        columnNames: ['termNumber', 'termYear', 'examType'],
        isUnique: true,
      }),
    );

    await queryRunner.createIndex(
      'report_release_settings',
      new TableIndex({
        name: 'IDX_REPORT_RELEASE_IS_RELEASED',
        columnNames: ['isReleased'],
      }),
    );

    await queryRunner.createIndex(
      'report_release_settings',
      new TableIndex({
        name: 'IDX_REPORT_RELEASE_SCHEDULED_DATE',
        columnNames: ['scheduledReleaseDate'],
      }),
    );

    // Add foreign key constraint for releasedByUserId (quote identifiers to preserve camelCase)
    await queryRunner.query(`
      ALTER TABLE "report_release_settings"
      ADD CONSTRAINT "FK_REPORT_RELEASE_USER"
      FOREIGN KEY ("releasedByUserId")
      REFERENCES "accounts"("id")
      ON DELETE SET NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('report_release_settings');
  }
}

