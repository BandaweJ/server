import { Injectable, NestMiddleware, ServiceUnavailableException } from '@nestjs/common';
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
    // Skip tenant DB work for CORS preflight; these requests don't need DB access
    if (req.method === 'OPTIONS') {
      return next();
    }

    const slug = this.resolveSlug(req);
    try {
      const tenant = await this.tenantService.findBySlug(slug);
      req[TENANT_REQUEST_KEY] = tenant;

      const queryRunner = this.dataSource.createQueryRunner();
      try {
        // Fail fast if the database is slow or unavailable instead of hanging requests indefinitely
        await this.connectWithTimeout(queryRunner, 5000);
        await queryRunner.query(
          `SET search_path TO "${tenant.schemaName}", public`,
        );
        req[QUERY_RUNNER_REQUEST_KEY] = queryRunner;

        res.on('finish', () => {
          queryRunner.release().catch(() => {});
        });
      } catch (dbError) {
        // Ensure we don't leak query runners on connection error
        await queryRunner.release().catch(() => {});
        throw dbError;
      }

      next();
    } catch (err) {
      next(err);
    }
  }

  private async connectWithTimeout(
    queryRunner: import('typeorm').QueryRunner,
    timeoutMs: number,
  ): Promise<void> {
    let timeoutHandle: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        queryRunner.connect(),
        new Promise<never>((_, reject) => {
          timeoutHandle = setTimeout(
            () =>
              reject(
                new ServiceUnavailableException(
                  'Database connection timeout for tenant context',
                ),
              ),
            timeoutMs,
          );
        }),
      ]);
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
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
