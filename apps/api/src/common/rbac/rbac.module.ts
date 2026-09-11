import { CacheModule } from '@nestjs/cache-manager';
import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { redisStore } from 'cache-manager-ioredis-yet';

import { AuthorizationService } from './authorization.service';
import { RbacGuard } from './rbac.guard';
import { RbacService } from './rbac.service';
import { ReadOnlyGuard } from './read-only.guard';

/**
 * RbacModule — provides permission resolution with Redis cache,
 * and the authorization utilities needed by all domain services.
 *
 * @Global so RbacService, RbacGuard, and AuthorizationService are
 * available everywhere without re-importing this module.
 *
 * The CacheModule here uses Redis as the backend for:
 *   - RBAC permission caching (5-minute TTL)
 *   - User account status caching (30-second TTL, used by JwtStrategy via AuthModule)
 *
 * This is a separate Redis connection from BullMQ, keeping caching
 * and job-queue concerns isolated.
 *
 * Exports:
 *   - RbacService:         Permission resolution + cache invalidation
 *   - RbacGuard:           Route-level permission guard
 *   - AuthorizationService: Reusable service-layer authorization patterns (R-3)
 *   - CacheModule:         Re-exported so AuthModule can use CACHE_MANAGER
 */
@Global()
@Module({
  imports: [
    CacheModule.registerAsync({
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => {
        if (config.get<string>('app.nodeEnv') === 'test') {
          return { ttl: 5 * 60 * 1000 };
        }
        return {
          store: await redisStore({
            host: config.get<string>('redis.host') ?? 'localhost',
            port: config.get<number>('redis.port') ?? 6379,
            password: config.get<string>('redis.password'),
            keyPrefix: 'elscore:cache:',
          }),
          ttl: 5 * 60 * 1000, // 5 minutes default; individual services override per key
        };
      },
    }),
  ],
  providers: [
    RbacService,
    RbacGuard,
    AuthorizationService,
  ],
  exports: [RbacService, RbacGuard, AuthorizationService, CacheModule],
})
export class RbacModule {}
