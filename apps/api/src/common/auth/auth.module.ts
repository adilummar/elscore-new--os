import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

import { AuditModule } from '../audit/audit.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { MustChangePasswordGuard } from './guards/must-change-password.guard';
import { UserStatusCacheService } from './services/user-status-cache.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { LocalStrategy } from './strategies/local.strategy';

/**
 * AuthModule — provides local JWT authentication.
 *
 * The JwtAuthGuard is registered as APP_GUARD, making it global.
 * All routes are protected by default. Use @Public() to opt out.
 *
 * JwtModule.register() is not used here because secrets come from ConfigService.
 * Each signAsync/verify call passes the secret explicitly.
 *
 * R-1: UserStatusCacheService is provided here so JwtStrategy can perform
 * account-status checks on every validated token.
 * It uses the CacheManager from RbacModule (which is @Global).
 *
 * Future extensibility:
 *   To add an external IdP (e.g., Clerk, Auth0), add a new strategy here
 *   without touching RbacModule or domain authorization logic.
 */
@Module({
  imports: [
    PassportModule,
    AuditModule,
    // JwtModule registered without defaults — each call specifies secret/expiry explicitly.
    // This allows different secrets for access vs. refresh tokens.
    JwtModule.register({}),
  ],
  providers: [
    AuthService,
    UserStatusCacheService,
    LocalStrategy,
    JwtStrategy,
  ],
  controllers: [AuthController],
  exports: [AuthService, UserStatusCacheService],
})
export class AuthModule {}
