/* eslint-disable prettier/prettier */
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AccountsEntity } from './entities/accounts.entity';
import { JwtStrategy } from './jwt.strategy';
import { ResourceByIdModule } from '../resource-by-id/resource-by-id.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ActivityModule } from '../activity/activity.module';

@Module({
  imports: [
    // JwtModule.register({
    //   secret: 'The way a crow shook on me',
    //   signOptions: {
    //     expiresIn: 3600 * 6,
    //   },
    // }),
    JwtModule.registerAsync({
      imports: [ConfigModule], // Import ConfigModule to make ConfigService available
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'), // Get the secret from the environment variable
        signOptions: {
          // You can also make expiresIn configurable
          expiresIn: configService.get<string>('JWT_EXPIRES_IN') || '3600s', // Defaults to 1 hour if not set
        },
      }),
      inject: [ConfigService], // Tell NestJS to inject ConfigService into useFactory
    }),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    TypeOrmModule.forFeature([AccountsEntity]),
    ResourceByIdModule,
    ActivityModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [JwtStrategy, PassportModule],
})
export class AuthModule {}
