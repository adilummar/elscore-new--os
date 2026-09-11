import { IncomingMessage, ServerResponse } from 'http';

import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';

/**
 * Structured logging via nestjs-pino (wraps pino-http).
 *
 * In development:  pretty-printed, colorized output.
 * In production:   JSON output for log aggregators (Datadog, CloudWatch, etc.)
 *
 * All NestJS log calls (this.logger.log, .warn, .error) route through pino.
 * HTTP request/response logging is automatic via pino-http middleware.
 */
@Module({
  imports: [
    PinoLoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const isDev = config.get<string>('app.nodeEnv') !== 'production';
        const level = config.get<string>('logging.level') ?? 'info';

        return {
          pinoHttp: {
            level,
            ...(isDev
              ? {
                  transport: {
                    target: 'pino-pretty',
                    options: {
                      colorize: true,
                      translateTime: 'SYS:standard',
                      ignore: 'pid,hostname',
                      singleLine: false,
                    },
                  },
                }
              : {}),
            // Redact sensitive fields from logs
            redact: {
              paths: [
                'req.headers.authorization',
                'req.body.password',
                'req.body.passwordHash',
                'req.body.refreshToken',
              ],
              censor: '[REDACTED]',
            },
            // Customize serializers
            serializers: {
              req: (req: IncomingMessage) => ({
                method: req.method ?? '',
                url: req.url ?? '',
              }),
            },
            customSuccessMessage: (
              req: IncomingMessage,
              res: ServerResponse,
              responseTime: number,
            ) => `${req.method ?? ''} ${req.url ?? ''} → ${res.statusCode} (${responseTime}ms)`,
          },
        };
      },
    }),
  ],
})
export class AppLoggerModule {}
