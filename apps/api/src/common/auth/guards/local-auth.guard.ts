import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Used specifically on the POST /auth/login endpoint to invoke LocalStrategy.
 * Do not use this guard on any other endpoint.
 */
@Injectable()
export class LocalAuthGuard extends AuthGuard('local') {}
