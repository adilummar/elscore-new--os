/**
 * EL SCORE OS — NestJS API Entry Point
 *
 * Bootstrap order:
 *   1. Load configuration and validate environment
 *   2. Apply global middleware (Helmet, compression, CORS)
 *   3. Apply global pipes (validation), filters (error handling), interceptors
 *   4. Configure Swagger documentation
 *   5. Start listening
 */

import 'reflect-metadata';

process.on('uncaughtException', (err: any) => {
  if (err.message && err.message.includes('ECONNREFUSED') && err.stack?.includes('ioredis')) {
    return; // Suppress ioredis connection refused spam
  }
  console.error('Uncaught Exception:', err);
  process.exit(1);
});

import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import compression from 'compression';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    // Disable built-in logger; replaced by nestjs-pino
    bufferLogs: true,
  });

  // ─── Logger ───────────────────────────────────────────────────────────────
  app.useLogger(app.get(Logger));

  const configService = app.get(ConfigService);
  const port = configService.get<number>('app.port') ?? 3001;
  const prefix = configService.get<string>('app.prefix') ?? 'api/v1';
  const corsOrigins = configService.get<string[]>('app.corsOrigins') ?? [];
  const nodeEnv = configService.get<string>('app.nodeEnv') ?? 'development';

  // ─── Security ─────────────────────────────────────────────────────────────
  app.use(
    helmet({
      contentSecurityPolicy: nodeEnv === 'production',
    }),
  );
  app.use(compression());

  app.enableCors({
    origin: corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // ─── Global prefix ────────────────────────────────────────────────────────
  app.setGlobalPrefix(prefix);

  // ─── Global validation pipe ───────────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Strip properties not in DTO
      forbidNonWhitelisted: true, // Throw on extra properties
      transform: true, // Auto-transform payload to DTO class instances
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // ─── Global exception filters ─────────────────────────────────────────────
  // Order matters: Prisma filter is checked first (more specific), then generic
  app.useGlobalFilters(new AllExceptionsFilter(), new PrismaExceptionFilter());

  // ─── Global response transform interceptor ────────────────────────────────
  app.useGlobalInterceptors(new TransformInterceptor());

  // ─── Swagger (disabled in production by default) ──────────────────────────
  if (nodeEnv !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('EL SCORE OS API')
      .setDescription('Internal operating system API for El Score Academy')
      .setVersion('1.0')
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('docs', app, document);
  }

  // ─── Graceful shutdown ────────────────────────────────────────────────────
  app.enableShutdownHooks();

  const prismaService = app.get(require('./common/prisma/prisma.service').PrismaService);
  await prismaService.sequence.upsert({where: {entityType: 'LED'}, update: {nextNumber: {increment: 1000}}, create: {entityType: 'LED', prefix: 'LED-', nextNumber: 5000}});
  await prismaService.sequence.upsert({where: {entityType: 'STU'}, update: {nextNumber: {increment: 1000}}, create: {entityType: 'STU', prefix: 'STU-', nextNumber: 5000}});
  await prismaService.sequence.upsert({where: {entityType: 'RQT'}, update: {nextNumber: {increment: 1000}}, create: {entityType: 'RQT', prefix: 'RQT-', nextNumber: 5000}});

  await app.listen(port);

  const logger = app.get(Logger);
  logger.log(`🚀 API running on http://localhost:${port}/${prefix}`, 'Bootstrap');
  if (nodeEnv !== 'production') {
    logger.log(`📖 Swagger docs at http://localhost:${port}/docs`, 'Bootstrap');
  }
}

bootstrap().catch((err: unknown) => {
  // eslint-disable-next-line no-console -- NestJS logger unavailable if bootstrap fails
  console.error('Fatal bootstrap error:', err);
  process.exit(1);
});
