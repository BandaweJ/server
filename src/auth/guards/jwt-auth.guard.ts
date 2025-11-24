import { Injectable, ExecutionContext, UnauthorizedException, Logger } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { throwError } from 'rxjs';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  private readonly logger = new Logger(JwtAuthGuard.name);

  canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
    // Call parent canActivate to trigger Passport JWT strategy
    return super.canActivate(context) as Promise<boolean>;
  }

  handleRequest(err: any, user: any, info: any, context: ExecutionContext) {
    // Log authentication attempt
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers?.authorization;
    
    this.logger.log('JwtAuthGuard: handleRequest called', {
      hasError: !!err,
      hasUser: !!user,
      hasInfo: !!info,
      hasAuthHeader: !!authHeader,
      errorMessage: err?.message,
      errorName: err?.name,
      infoMessage: info?.message,
      infoName: info?.name,
      url: request.url,
    });

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
      
      this.logger.error('JwtAuthGuard: Authentication failed', {
        error: err,
        errorMessage: err?.message,
        errorName: err?.name,
        errorStack: err?.stack,
        info: info,
        infoMessage: info?.message,
        infoName: info?.name,
        url: request.url,
      });
      throw new UnauthorizedException(errorMessage);
    }

    // If no user, authentication failed
    if (!user) {
      this.logger.error('JwtAuthGuard: No user returned from JWT strategy', {
        url: request.url,
        hasAuthHeader: !!authHeader,
        authHeaderPrefix: authHeader?.substring(0, 20),
      });
      throw new UnauthorizedException('Authentication failed. Please log in again.');
    }

    this.logger.debug('JwtAuthGuard: Authentication successful', {
      userId: (user as any)?.id,
      username: (user as any)?.username,
      role: (user as any)?.role,
    });

    return user;
  }
}

