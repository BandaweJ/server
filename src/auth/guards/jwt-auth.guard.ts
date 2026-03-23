import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { throwError } from 'rxjs';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  private readonly logger = new Logger(JwtAuthGuard.name);

  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    // Call parent canActivate to trigger Passport JWT strategy
    return super.canActivate(context) as Promise<boolean>;
  }

  handleRequest(err: any, user: any, info: any, context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();

    // If there's an error or info (like expired token), throw UnauthorizedException
    if (err || info) {
      // Extract error message from various possible locations
      let errorMessage = 'Authentication failed';
      if (err?.message) {
        errorMessage = err.message;
      } else if (info?.message) {
        errorMessage = info.message;
      } else if (err?.response?.message) {
        errorMessage = err.response.message;
      } else if (typeof err === 'string') {
        errorMessage = err;
      } else if (typeof info === 'string') {
        errorMessage = info;
      }

      this.logger.warn('Authentication failed in JwtAuthGuard', {
        url: request.url,
        errorMessage,
      });
      throw new UnauthorizedException(errorMessage);
    }

    // If no user, authentication failed
    if (!user) {
      this.logger.error('JwtAuthGuard: No user returned from JWT strategy', {
        url: request.url,
        hasAuthHeader: !!request.headers?.authorization,
      });
      throw new UnauthorizedException(
        'Authentication failed. Please log in again.',
      );
    }

    this.logger.debug('JwtAuthGuard: Authentication successful', {
      userId: (user as any)?.id,
      username: (user as any)?.username,
      role: (user as any)?.role,
    });

    return user;
  }
}
