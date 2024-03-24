import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AccountsEntity } from './entities/accounts.entity';
import { JwtStrategy } from './jwt.strategy';
import { ResourceByIdModule } from '../resource-by-id/resource-by-id.module';

@Module({
  imports: [
    JwtModule.register({
      secret: 'The way a crow shook on me',
      signOptions: {
        expiresIn: 3600 * 6,
      },
    }),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    TypeOrmModule.forFeature([AccountsEntity]),
    ResourceByIdModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [JwtStrategy, PassportModule],
})
export class AuthModule {}
