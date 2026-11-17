
import {
  Controller,
  Post,
  Body,
  Get,
  UseGuards,
  Request,
  Req,
  Res,
  Query,
  HttpCode,
  UnauthorizedException,
  Delete,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import type {
  CookieOptions,
  Request as ExpressRequest,
  Response as ExpressResponse,
} from 'express';
import { Roles } from './decorators/roles.decorator.js';
import { RolesGuard } from './guards/roles.guard.js';
import { AuthService } from './auth.service.js';
import { LoginUserDto } from '../users/dto/login-user.dto.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { ForgotPasswordDto } from './dto/forgot-password.dto.js';
import { ResetPasswordDto } from './dto/reset-password.dto.js';
import { CreateUserDto } from '../users/dto/create-user.dto.js';
import { Throttle } from '../common/throttle/throttle.js';
import { ChangePasswordDto } from './dto/change-password.dto.js';
import { DeleteAccountDto } from './dto/delete-account.dto.js';
import { CurrentUser, type AuthenticatedUser } from './decorators/current-user.decorator.js';
import type { SessionMeta } from './sessions.service.js';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

const REFRESH_COOKIE = 'refresh_token';

// Shown on the "Logged-in devices" list
function sessionMeta(req: ExpressRequest): SessionMeta {
  return {
    userAgent: req.headers['user-agent'],
    ipAddress: req.ip,
  };
}

// httpOnly: JavaScript can't read it. path: only sent to the auth routes.
// Behind the frontend's /api proxy the browser sees /api/auth, so the path is configurable.
const refreshCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: process.env.REFRESH_COOKIE_PATH ?? '/auth',
};

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  private setRefreshCookie(res: ExpressResponse, refreshToken: string) {
    res.cookie(REFRESH_COOKIE, refreshToken, {
      ...refreshCookieOptions,
      maxAge: 7 * 24 * 60 * 60 * 1000, // same as the refresh token's 7d expiry
    });
  }

  private clearRefreshCookie(res: ExpressResponse) {
    res.clearCookie(REFRESH_COOKIE, refreshCookieOptions);
  }

  @ApiOperation({ summary: 'Exchange the refresh_token cookie for a new access token' })
  @ApiCookieAuth(REFRESH_COOKIE)
  @ApiUnauthorizedResponse({ description: 'Missing, invalid, expired or already used refresh token' })
  @Post('refresh')
  async refreshTokens(
    @Req() req: ExpressRequest,
    @Res({ passthrough: true }) res: ExpressResponse,
  ) {
    const refreshToken: string | undefined = req.cookies?.[REFRESH_COOKIE];

    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token missing');
    }

    try {
      const tokens = await this.authService.refreshTokens(refreshToken);
      this.setRefreshCookie(res, tokens.refresh_token);
      return { access_token: tokens.access_token };
    } catch (error) {
      // Only drop the cookie if it can never work again. A lost race keeps the session.
      if (
        error instanceof UnauthorizedException &&
        error.message !== 'Refresh token already used'
      ) {
        this.clearRefreshCookie(res);
      }
      throw error;
    }
  }

  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @ApiOperation({ summary: 'Email a password reset link' })
  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Set a new password using a reset token' })
  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(
      dto.resetToken,
      dto.newPassword,
    );
  }

  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Create an account and send a verification email' })
  @Post('register')
  register(@Body() body: CreateUserDto) {
    return this.authService.register(body);
  }

  //only for test
  // @Post('test-email')
  // testEmail(@Body('email') email: string) {
  //   return this.authService.testEmail(email);
  // }

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Verify an email address using the emailed token' })
  @Get('verify-email')
  verifyEmail(@Query('token') token: string) {
    return this.authService.verifyEmail(token);
  }
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Log in: returns an access token and sets the refresh_token cookie' })
  @ApiUnauthorizedResponse({ description: 'Wrong email or password, or email not verified' })
  @Post('login')
  @HttpCode(200)
  async login(
    @Body() dto: LoginUserDto,
    @Req() req: ExpressRequest,
    @Res({ passthrough: true }) res: ExpressResponse,
  ) {
    const { refresh_token, ...body } = await this.authService.login(dto, sessionMeta(req));
    this.setRefreshCookie(res, refresh_token);
    return body;
  }
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @ApiOperation({ summary: 'Start a demo: creates a temporary account with sample tasks and logs it in' })
  @Post('demo')
  @HttpCode(200)
  async demo(
    @Req() req: ExpressRequest,
    @Res({ passthrough: true }) res: ExpressResponse,
  ) {
    const { refresh_token, ...body } = await this.authService.startDemo(sessionMeta(req));
    this.setRefreshCookie(res, refresh_token);
    return body;
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Log out this device and clear the refresh_token cookie' })
  @ApiUnauthorizedResponse({ description: 'Missing, invalid or revoked access token' })
  @Post('logout')
  logout(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) res: ExpressResponse,
  ) {
    this.clearRefreshCookie(res);
    return this.authService.logout(user.userId, user.sessionId);
  }

  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Change your password. Signs out every other device; this one stays logged in' })
  @ApiUnauthorizedResponse({ description: 'Missing, invalid or revoked access token' })
  @Post('change-password')
  @HttpCode(200)
  changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(
      user.userId,
      user.sessionId,
      dto.currentPassword,
      dto.newPassword,
    );
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List your logged-in devices. The one making the request has current: true' })
  @ApiUnauthorizedResponse({ description: 'Missing, invalid or revoked access token' })
  @Get('sessions')
  listSessions(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.listSessions(user.userId, user.sessionId);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Sign out every device except this one' })
  @ApiUnauthorizedResponse({ description: 'Missing, invalid or revoked access token' })
  @Delete('sessions')
  revokeOtherSessions(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.revokeOtherSessions(user.userId, user.sessionId);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Sign out one of your devices' })
  @ApiUnauthorizedResponse({ description: 'Missing, invalid or revoked access token' })
  @Delete('sessions/:id')
  async revokeSession(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Res({ passthrough: true }) res: ExpressResponse,
  ) {
    const result = await this.authService.revokeSession(user.userId, id);
    // Signing out this device is the same as logging out
    if (id === user.sessionId) this.clearRefreshCookie(res);
    return result;
  }

  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete your own account, with all its tasks. Needs your password' })
  @ApiUnauthorizedResponse({ description: 'Missing, invalid or revoked access token' })
  @Delete('account')
  async deleteAccount(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: DeleteAccountDto,
    @Res({ passthrough: true }) res: ExpressResponse,
  ) {
    const result = await this.authService.deleteAccount(user.userId, dto.password);
    this.clearRefreshCookie(res);
    return result;
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get the logged-in user' })
  @ApiUnauthorizedResponse({ description: 'Missing, invalid or revoked access token' })
  @Get('profile')
  getProfile(@Request() req: any) {
    return {
      message: 'You are authenticated!',
      user: req.user,
    };
  }
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin-only test route' })
  @ApiUnauthorizedResponse({ description: 'Missing, invalid or revoked access token' })
  @Get('admin')
  adminDashboard() {
    return {
      message: 'Welcome Admin! You have access.',
    };
  }
}
