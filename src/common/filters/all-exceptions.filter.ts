import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let errorResponse: any = {};

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'string') {
        message = res;
      } else if (typeof res === 'object' && res !== null) {
        message = (res as any).message || message;
        errorResponse = res;
      }
    } else if (exception instanceof Error) {
      message = exception.message;
      errorResponse = { message };
    } else if (typeof exception === 'string') {
      message = exception;
      errorResponse = { message };
    }

    this.logger.error(
      `Unhandled exception on ${request.method} ${request.url}`,
      exception instanceof Error ? exception.stack : JSON.stringify(exception),
    );

    response.status(status).json({
      statusCode: status,
      message,
      ...(typeof errorResponse === 'object' ? errorResponse : {}),
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}


