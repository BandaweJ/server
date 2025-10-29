/* eslint-disable prettier/prettier */
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { ActivityService } from '../activity.service';
import { Request } from 'express';

@Injectable()
export class ActivityInterceptor implements NestInterceptor {
  constructor(private activityService: ActivityService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<Request>();
    const { method, url, ip, headers } = request;
    const userAgent = headers['user-agent'];

    // Only log important actions (not GET requests that don't modify data)
    const shouldLog = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);

    if (!shouldLog) {
      return next.handle();
    }

    const user = (request as any).user; // User from JWT guard
    if (!user) {
      return next.handle();
    }

    return next.handle().pipe(
      tap(async (response) => {
        try {
          // Extract action from URL and method
          const action = this.determineAction(method, url, response);
          if (!action) return;

          const description = this.generateDescription(method, url, response, user);
          const resourceType = this.extractResourceType(url);
          const resourceId = this.extractResourceId(url, response);

          await this.activityService.logActivity({
            userId: user.id,
            action,
            description,
            ipAddress: ip,
            userAgent,
            resourceType,
            resourceId,
            metadata: {
              method,
              url,
              response: this.sanitizeResponse(response),
            },
          });
        } catch (error) {
          // Don't fail the request if activity logging fails
          console.error('Failed to log activity:', error);
        }
      }),
    );
  }

  private determineAction(method: string, url: string, response: any): string | null {
    // Map URL patterns to actions
    if (url.includes('/auth/') && method === 'POST') {
      if (url.includes('/signin')) return 'LOGIN';
      if (url.includes('/signup')) return 'USER_CREATED';
      if (url.includes('/reset-password')) return 'PASSWORD_RESET';
      if (url.includes('/set-password')) return 'PASSWORD_CHANGED';
    }

    if (url.includes('/auth/') && method === 'PATCH') {
      if (url.includes('/profile')) return 'PROFILE_UPDATED';
      return 'USER_UPDATED';
    }

    // Add more patterns as needed
    return null;
  }

  private generateDescription(method: string, url: string, response: any, user: any): string {
    const username = user.username || user.id;
    
    if (url.includes('/auth/')) {
      if (url.includes('/signin')) return `User ${username} logged in`;
      if (url.includes('/signup')) return `New user account created for ${username}`;
      if (url.includes('/reset-password')) return `Password reset for user ${username}`;
      if (url.includes('/set-password')) return `Password changed for user ${username}`;
      if (url.includes('/profile')) return `Profile updated for user ${username}`;
      return `User ${username} account updated`;
    }

    return `${method} ${url} by ${username}`;
  }

  private extractResourceType(url: string): string | undefined {
    if (url.includes('/auth/')) return 'user';
    if (url.includes('/student')) return 'student';
    if (url.includes('/teacher')) return 'teacher';
    if (url.includes('/parent')) return 'parent';
    return undefined;
  }

  private extractResourceId(url: string, response: any): string | undefined {
    // Try to extract ID from URL
    const match = url.match(/\/([a-f0-9-]{36}|[a-zA-Z0-9]+)$/);
    if (match && match[1]) {
      return match[1];
    }

    // Try to extract from response
    if (response?.id) return response.id;
    if (response?.userId) return response.userId;

    return undefined;
  }

  private sanitizeResponse(response: any): any {
    // Remove sensitive data from metadata
    if (typeof response === 'object' && response !== null) {
      const sanitized = { ...response };
      delete sanitized.password;
      delete sanitized.salt;
      delete sanitized.token;
      delete sanitized.accessToken;
      return sanitized;
    }
    return response;
  }
}

