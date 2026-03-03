import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantEntity } from './entities/tenant.entity';

export interface TenantInfo {
  id: string;
  slug: string;
  schemaName: string;
  name: string;
  settings: Record<string, unknown> | null;
}

@Injectable()
export class TenantService {
  private readonly isSingleTenant = process.env.SINGLE_TENANT === 'true';

  constructor(
    @InjectRepository(TenantEntity)
    private readonly tenantRepository: Repository<TenantEntity>,
  ) {}

  async findBySlug(slug: string): Promise<TenantInfo> {
    const tenant = await this.tenantRepository.findOne({ where: { slug } });
    if (!tenant) {
      throw new NotFoundException(`Tenant not found: ${slug}`);
    }
    return {
      id: tenant.id,
      slug: tenant.slug,
      schemaName: tenant.schemaName,
      name: tenant.name,
      settings: tenant.settings ?? null,
    };
  }

  async getDefaultSlug(): Promise<string> {
    if (this.isSingleTenant) {
      return (process.env.SINGLE_TENANT_SLUG || 'default').trim().toLowerCase();
    }

    const tenant = await this.tenantRepository.findOne({
      where: { slug: 'default' },
    });
    return tenant?.slug ?? 'default';
  }

  /** List all tenants for sign-in school selector (reads from public.tenants). */
  async listOptions(): Promise<{ slug: string; name: string }[]> {
    // In single-tenant mode, treat this as a simple static "app info" endpoint and
    // avoid hitting the tenants table at all.
    if (this.isSingleTenant) {
      const slug = (process.env.SINGLE_TENANT_SLUG || 'default')
        .trim()
        .toLowerCase();
      const name =
        (process.env.SINGLE_TENANT_NAME || 'Default School').trim() ||
        'Default School';

      return [{ slug, name }];
    }

    const rows = await this.tenantRepository.find({
      select: ['slug', 'name'],
      order: { name: 'ASC' },
    });
    return rows.map((t) => ({ slug: t.slug, name: t.name }));
  }
}
