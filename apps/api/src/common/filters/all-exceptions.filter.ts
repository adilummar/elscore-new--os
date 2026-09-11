import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';

/**
 * AllExceptionsFilter — catches every unhandled exception and returns a
 * consistent JSON error envelope.
 *
 * Response format:
 *   {
 *     statusCode: number,
 *     message: string | string[],
 *     error: string,
 *     correlationId: string,   // for support/tracing
 *     timestamp: string
 *   }
 *
 * Sensitive internal errors are sanitized before sending to the client.
 * Full stack traces are logged server-side only.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const correlationId = uuidv4();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'An unexpected error occurred';
    let error = 'Internal Server Error';

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const res = exceptionResponse as Record<string, unknown>;
        message = (res['message'] as string | string[]) ?? exception.message;
        error = (res['error'] as string) ?? exception.name;
      }
    } else if (exception instanceof Error) {
      // Non-HTTP errors — log the full error, return generic message
      this.logger.error(
        `Unhandled exception [${correlationId}]: ${exception.message}`,
        exception.stack,
      );
    } else {
      this.logger.error(`Unknown exception [${correlationId}]`, String(exception));
    }

    // Log all errors server-side
    this.logger.warn(
      `${request.method} ${request.url} → ${statusCode} [${correlationId}]`,
    );

    response.status(statusCode).json({
      statusCode,
      message,
      error,
      correlationId,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
