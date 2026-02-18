import { Module, Scope } from '@nestjs/common';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { REQUEST } from '@nestjs/core';
import { TenantEntity } from './entities/tenant.entity';
import { TenantService } from './tenant.service';
import { TenantMiddleware } from './tenant.middleware';
import { QUERY_RUNNER_REQUEST_KEY } from './tenant.middleware';
import { TENANT_SCOPED_ENTITIES } from './tenant-scoped-entities';
import { TenantController } from './tenant.controller';

const requestScopedRepositoryProviders = TENANT_SCOPED_ENTITIES.map(
  (entity) => ({
    provide: getRepositoryToken(entity as Function),
    scope: Scope.REQUEST,
    useFactory: (req: Record<string, unknown>) => {
      const qr = req?.[QUERY_RUNNER_REQUEST_KEY] as
        | { manager: { getRepository: (e: unknown) => unknown } }
        | undefined;
      if (!qr) {
        throw new Error(
          'Tenant context not set. Ensure TenantMiddleware runs before routes that need DB access.',
        );
      }
      return qr.manager.getRepository(entity);
    },
    inject: [REQUEST],
  }),
);

@Module({
  imports: [
    TypeOrmModule.forFeature([TenantEntity]),
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '1h' },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [TenantController],
  providers: [TenantService, TenantMiddleware, ...requestScopedRepositoryProviders],
  exports: [TenantService, TenantMiddleware, TypeOrmModule],
})
export class TenantModule {}
