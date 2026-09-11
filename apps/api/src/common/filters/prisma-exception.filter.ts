import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';

/**
 * PrismaExceptionFilter — converts Prisma errors to appropriate HTTP responses.
 *
 * Handles:
 *  - P2002 (Unique constraint violation) → 409 Conflict
 *  - P2025 (Record not found) → 404 Not Found
 *  - P2003 (Foreign key constraint) → 409 Conflict
 *  - Other Prisma errors → 500 Internal Server Error
 *
 * Raw Prisma error messages are never exposed to clients.
 * All errors are logged with a correlation ID.
 */
@Catch(Prisma.PrismaClientKnownRequestError, Prisma.PrismaClientUnknownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  catch(
    exception: Prisma.PrismaClientKnownRequestError | Prisma.PrismaClientUnknownRequestError,
    host: ArgumentsHost,
  ): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const correlationId = uuidv4();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'A database error occurred';

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      switch (exception.code) {
        case 'P2002':
          statusCode = HttpStatus.CONFLICT;
          message = 'A record with this value already exists';
          break;
        case 'P2025':
          statusCode = HttpStatus.NOT_FOUND;
          message = 'The requested record was not found';
          break;
        case 'P2003':
          statusCode = HttpStatus.CONFLICT;
          message = 'This operation violates a data relationship constraint';
          break;
        case 'P2014':
          statusCode = HttpStatus.CONFLICT;
          message = 'This change would violate a required relationship';
          break;
        default:
          this.logger.error(
            `Unhandled Prisma error [${correlationId}] code=${exception.code}`,
            exception.message,
          );
      }
    } else {
      this.logger.error(`Unknown Prisma error [${correlationId}]`, exception.message);
    }

    response.status(statusCode).json({
      statusCode,
      message,
      error: 'Database Error',
      correlationId,
      timestamp: new Date().toISOString(),
    });
  }
}
