/* eslint-disable prettier/prettier */
import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

@Injectable()
export class LoggingMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: Request, res: Response, next: NextFunction) {
    const { method, originalUrl, ip } = req;
    const startTime = Date.now();
    const incomingRequestId = req.header('x-request-id');
    const requestId =
      typeof incomingRequestId === 'string' && incomingRequestId.trim().length > 0
        ? incomingRequestId
        : randomUUID();
    res.setHeader('x-request-id', requestId);

    this.logger.log(
      `[${requestId}] ${method} ${originalUrl} - Request received from ${ip}`,
    );

    res.on('finish', () => {
      const { statusCode } = res;
      const duration = Date.now() - startTime;
      const logMessage = `[${requestId}] ${method} ${originalUrl} ${statusCode} - ${duration}ms`;

      if (statusCode >= 500) {
        this.logger.error(logMessage);
      } else if (statusCode >= 400) {
        this.logger.warn(logMessage);
      } else {
        this.logger.log(logMessage);
      }
    });

    next();
  }
}

