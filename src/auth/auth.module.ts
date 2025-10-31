/* eslint-disable prettier/prettier */
import { Module, forwardRef } from '@nestjs/common';
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
      useFactory: (configService: ConfigService) => {
        const expiresInStr = configService.get<string>('JWT_EXPIRES_IN') || '3600';
        // Parse to number (in seconds) - convert string format like "3600s" to number
        let expiresIn: number;
        if (expiresInStr.endsWith('s')) {
          expiresIn = parseInt(expiresInStr.slice(0, -1), 10) || 3600;
        } else if (expiresInStr.endsWith('m')) {
          expiresIn = (parseInt(expiresInStr.slice(0, -1), 10) || 60) * 60;
        } else if (expiresInStr.endsWith('h')) {
          expiresIn = (parseInt(expiresInStr.slice(0, -1), 10) || 1) * 3600;
        } else {
          expiresIn = parseInt(expiresInStr, 10) || 3600;
        }
        return {
          secret: configService.get<string>('JWT_SECRET'), // Get the secret from the environment variable
          signOptions: {
            expiresIn, // Number in seconds (defaults to 1 hour = 3600 seconds)
          },
        };
      },
      inject: [ConfigService], // Tell NestJS to inject ConfigService into useFactory
    }),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    TypeOrmModule.forFeature([AccountsEntity]),
    ResourceByIdModule,
    forwardRef(() => ActivityModule), // Use forwardRef to handle circular dependency
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [JwtStrategy, PassportModule],
})
export class AuthModule {}
