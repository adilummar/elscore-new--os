import { SetMetadata } from '@nestjs/common';

export const SKIP_MUST_CHANGE_PASSWORD_KEY = 'skipMustChangePassword';

/**
 * Bypasses the MustChangePasswordGuard for specific routes.
 * Use this on routes that a user with mustChangePassword = true is allowed to access
 * (e.g. the change-password route itself).
 */
export const SkipMustChangePassword = () => SetMetadata(SKIP_MUST_CHANGE_PASSWORD_KEY, true);
