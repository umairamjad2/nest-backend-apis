
import {
  Controller,
  Post,
  Body,
  Get,
  UseGuards,
  Request,
  Query,
  HttpCode,
} from '@nestjs/common';
import { Roles } from './decorators/roles.decorator.js';
import { RolesGuard } from './guards/roles.guard.js';
import { AuthService } from './auth.service.js';
import { LoginUserDto } from '../users/dto/login-user.dto.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { RefreshTokenDto } from './dto/refresh-token.dto.js';
import { ForgotPasswordDto } from './dto/forgot-password.dto.js';
import { ResetPasswordDto } from './dto/reset-password.dto.js';
import { CreateUserDto } from '../users/dto/create-user.dto.js';
import { Throttle } from '@nestjs/throttler';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('refresh')
  refreshTokens(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshTokens(dto.refreshToken);
  }

  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }
  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(
      dto.resetToken,
      dto.newPassword,
    );
  }

  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('register')
  register(@Body() body: CreateUserDto) {
    return this.authService.register(body);
  }

  //only for test
  // @Post('test-email')
  // testEmail(@Body('email') email: string) {
  //   return this.authService.testEmail(email);
  // }

  @Get('verify-email')
  verifyEmail(@Query('token') token: string) {
    return this.authService.verifyEmail(token);
  }
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginUserDto) {
    return this.authService.login(dto);
  }
  @UseGuards(JwtAuthGuard)
  @Post('logout')
  logout(@Request() req: any) {
    return this.authService.logout(req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('profile')
  getProfile(@Request() req: any) {
    return {
      message: 'You are authenticated!',
      user: req.user,
    };
  }
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Get('admin')
  adminDashboard() {
    return {
      message: 'Welcome Admin! You have access.',
    };
  }
}
