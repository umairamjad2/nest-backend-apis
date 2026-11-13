
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
import { Throttle } from '@nestjs/throttler';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

const REFRESH_COOKIE = 'refresh_token';

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
    @Res({ passthrough: true }) res: ExpressResponse,
  ) {
    const { refresh_token, ...body } = await this.authService.login(dto);
    this.setRefreshCookie(res, refresh_token);
    return body;
  }
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Log out, revoke all tokens and clear the refresh_token cookie' })
  @ApiUnauthorizedResponse({ description: 'Missing, invalid or revoked access token' })
  @Post('logout')
  logout(
    @Request() req: any,
    @Res({ passthrough: true }) res: ExpressResponse,
  ) {
    this.clearRefreshCookie(res);
    return this.authService.logout(req.user.userId);
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
