import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marks an endpoint as public (no authentication required).
 *
 * Usage:
 *   @Public()
 *   @Post('auth/login')
 *   login() { ... }
 *
 * JwtAuthGuard checks for this metadata and skips token validation.
 * All other endpoints are protected by default when JwtAuthGuard is global.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
