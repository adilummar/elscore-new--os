import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request as ExpressRequest } from 'express';

import { AuthService, ValidatedUser } from './auth.service';
import { CurrentUser, RequestUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { SkipMustChangePassword } from './decorators/skip-must-change-password.decorator';
import { LogoutDto, RefreshTokenDto } from './dto/refresh-token.dto';
import { LocalAuthGuard } from './guards/local-auth.guard';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * POST /auth/login
   * Validates email + password and returns an access + refresh token pair.
   * Rate-limited by global ThrottlerGuard.
   */
  @Public()
  @UseGuards(LocalAuthGuard)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Authenticate with email and password' })
  async login(
    @Request() req: ExpressRequest & { user: ValidatedUser },
  ) {
    const userAgent = req.headers['user-agent'];
    const ipAddress = req.ip;
    const tokens = await this.authService.login(req.user, { userAgent, ipAddress });
    return {
      message: 'Login successful',
      requiresPasswordChange: req.user.requiresPasswordChange,
      ...tokens,
    };
  }

  /**
   * POST /auth/refresh
   * Exchanges a valid refresh token for a new token pair (rotation).
   */
  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate refresh token and issue new access token' })
  async refresh(@Body() body: RefreshTokenDto) {
    const tokens = await this.authService.refresh(body.refreshToken);
    return {
      message: 'Token refreshed',
      ...tokens,
    };
  }

  /**
   * POST /auth/logout
   * Revokes the provided refresh token (logs out current session).
   */
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @SkipMustChangePassword()
  @ApiOperation({ summary: 'Revoke current session refresh token' })
  async logout(@Body() body: LogoutDto, @CurrentUser() user: RequestUser) {
    await this.authService.logout(body.refreshToken, user.id);
    return { message: 'Logged out successfully' };
  }

  /**
   * GET /auth/me
   * Returns the currently authenticated user's identity.
   * Useful for clients to validate their token is still active.
   */
  @Get('me')
  @ApiBearerAuth()
  @SkipMustChangePassword()
  @ApiOperation({ summary: 'Get current authenticated user identity' })
  me(@CurrentUser() user: RequestUser) {
    return { id: user.id, email: user.email };
  }
}
