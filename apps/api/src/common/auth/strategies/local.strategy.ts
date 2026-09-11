import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-local';

import { AuthService } from '../auth.service';
import type { ValidatedUser } from '../auth.service';

/**
 * Local (email + password) strategy for the login endpoint.
 * Delegates credential verification to AuthService.validateCredentials().
 *
 * Passport calls this strategy when LocalAuthGuard is applied.
 * On success, the returned user object is set as req.user for the controller.
 */
@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy, 'local') {
  constructor(private readonly authService: AuthService) {
    super({ usernameField: 'email' });
  }

  async validate(email: string, password: string): Promise<ValidatedUser> {
    const user = await this.authService.validateCredentials(email, password);
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }
    return user;
  }
}
