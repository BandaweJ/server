import { Controller, Get, Req } from '@nestjs/common';
import { TENANT_REQUEST_KEY } from './tenant.middleware';

export interface TenantContextDto {
  slug: string;
  name: string;
  id: string;
  features?: Record<string, boolean>;
  settings?: Record<string, unknown>;
}

@Controller('tenant')
export class TenantController {
  @Get('context')
  getContext(@Req() req: Record<string, unknown>): TenantContextDto | null {
    const tenant = req[TENANT_REQUEST_KEY] as { id: string; slug: string; name: string; settings?: Record<string, unknown> } | undefined;
    if (!tenant) return null;
    const settings = tenant.settings ?? {};
    return {
      slug: tenant.slug,
      name: tenant.name,
      id: tenant.id,
      features: (settings as { features?: Record<string, boolean> }).features,
      settings: settings as Record<string, unknown>,
    };
  }

  @Get('features')
  getFeatures(@Req() req: Record<string, unknown>): Record<string, boolean> {
    const tenant = req[TENANT_REQUEST_KEY] as { settings?: { features?: Record<string, boolean> } } | undefined;
    return (tenant?.settings?.features as Record<string, boolean>) ?? {};
  }
}
