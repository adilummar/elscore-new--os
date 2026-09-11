import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface StandardResponse<T> {
  data: T;
  timestamp: string;
}

/**
 * TransformInterceptor — wraps successful responses in a consistent envelope.
 *
 * Input (from controller):     { id: '1', name: 'John' }
 * Output (to client):          { data: { id: '1', name: 'John' }, timestamp: '...' }
 *
 * Exceptions bypass this interceptor (handled by ExceptionFilters instead).
 *
 * If a controller returns null or undefined, data will be null.
 */
@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, StandardResponse<T>> {
  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<StandardResponse<T>> {
    return next.handle().pipe(
      map((data) => ({
        data,
        timestamp: new Date().toISOString(),
      })),
    );
  }
}
