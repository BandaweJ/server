import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { DataSource } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { TenantService, TenantInfo } from './tenant.service';

export const TENANT_REQUEST_KEY = 'tenant';
export const QUERY_RUNNER_REQUEST_KEY = 'queryRunner';

declare global {
  namespace Express {
    interface Request {
      [TENANT_REQUEST_KEY]?: TenantInfo;
      [QUERY_RUNNER_REQUEST_KEY]?: import('typeorm').QueryRunner;
    }
  }
}

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(
    private readonly tenantService: TenantService,
    private readonly dataSource: DataSource,
    private readonly jwtService: JwtService,
  ) {}

  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    const slug = this.resolveSlug(req);
    try {
      const tenant = await this.tenantService.findBySlug(slug);
      req[TENANT_REQUEST_KEY] = tenant;

      const queryRunner = this.dataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.query(
        `SET search_path TO "${tenant.schemaName}", public`,
      );
      req[QUERY_RUNNER_REQUEST_KEY] = queryRunner;

      res.on('finish', () => {
        queryRunner.release().catch(() => {});
      });

      next();
    } catch (err) {
      next(err);
    }
  }

  private resolveSlug(req: Request): string {
    const header = req.headers['x-tenant'] as string | undefined;
    if (header?.trim()) return header.trim().toLowerCase();

    const auth = req.headers.authorization;
    if (auth?.startsWith('Bearer ')) {
      const token = auth.slice(7);
      try {
        const payload = this.jwtService.decode(token) as { tenantSlug?: string } | null;
        if (payload?.tenantSlug) return payload.tenantSlug;
      } catch {
        // ignore invalid token
      }
    }

    const host = req.headers.host ?? '';
    const parts = host.split('.');
    if (parts.length >= 2) {
      const subdomain = parts[0].toLowerCase();
      if (subdomain && subdomain !== 'www' && subdomain !== 'api') {
        return subdomain;
      }
    }

    return 'default';
  }
}
