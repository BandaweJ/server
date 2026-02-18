import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
} from 'typeorm';

/**
 * Tenant registry. Lives in public schema only (not in tenant schemas).
 * Used to resolve tenant by slug (subdomain/header) and get schema_name for search_path.
 */
@Entity({ name: 'tenants', schema: 'public' })
export class TenantEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  slug: string;

  @Column({ name: 'schema_name' })
  schemaName: string;

  @Column()
  name: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @Column({ type: 'jsonb', nullable: true })
  settings: Record<string, unknown> | null;
}
