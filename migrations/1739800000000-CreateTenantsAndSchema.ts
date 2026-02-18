import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTenantsAndSchema1739800000000 implements MigrationInterface {
  name = 'CreateTenantsAndSchema1739800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create tenants table in public schema (explicit for multi-tenant registry)
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS public.tenants (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        slug varchar UNIQUE NOT NULL,
        schema_name varchar NOT NULL,
        name varchar NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        settings jsonb
      )
    `);

    // Create first tenant schema
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS tenant_default`);

    // Insert default tenant (first school)
    await queryRunner.query(`
      INSERT INTO public.tenants (id, slug, schema_name, name, created_at, settings)
      VALUES (
        gen_random_uuid(),
        'default',
        'tenant_default',
        'Default School',
        now(),
        '{"studentNumberPrefix": "S"}'::jsonb
      )
      ON CONFLICT (slug) DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP SCHEMA IF EXISTS tenant_default CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS public.tenants`);
  }
}
