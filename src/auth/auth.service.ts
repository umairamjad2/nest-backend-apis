
import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service.js';
import { LoginUserDto } from '../users/dto/login-user.dto.js';
import * as bcrypt from 'bcrypt';
import { ConfigService } from '@nestjs/config';
import { randomBytes, createHash } from 'crypto';
import { NotFoundException } from '@nestjs/common';
import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { MailService } from '../mail/mail.service.js';
import { CreateUserDto } from '../users/dto/create-user.dto.js';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private prisma: PrismaService,
    private mailService: MailService,
  ) {}


  //generate token
  async generateTokens(
    userId: number,
    email: string,
    role: string,
    tokenVersion: number,
  ) 
  {
  const payload = {
    sub: userId,
    email,
    role,
    tokenVersion,
  };

  const [accessToken, refreshToken] = await Promise.all([
    this.jwtService.signAsync(payload, {
      secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
      expiresIn: '15m',
    }),

    this.jwtService.signAsync(payload, {
      secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      expiresIn: '7d',
    }),
  ]);

  // Hash refresh token
  const hashedRefreshToken = await bcrypt.hash(refreshToken, 10);

  // Store hashed token in database
  await this.usersService.updateRefreshToken(
    userId,
    hashedRefreshToken,
  );

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
    };
  }

   //Refresh Token
  async refreshTokens(refreshToken: string) {
    let payload: {
      sub: number;
      email: string;
      role: string;
    };

    try {
      payload = await this.jwtService.verifyAsync(refreshToken, {
      secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const user = await this.usersService.findById(payload.sub);

    if (!user || !user.refreshToken) {
      throw new UnauthorizedException('Access denied');
    }

    const isRefreshTokenValid = await bcrypt.compare(
      refreshToken,
      user.refreshToken,
    );

    if (!isRefreshTokenValid) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    return this.generateTokens(
      user.id,
      user.email,
      user.role,
      user.tokenVersion,
    );
  }
  //forget password 
  async forgotPassword(email: string) {
    const user = await this.usersService.findByEmail(email);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Generate a secure random token
    const resetToken = randomBytes(32).toString('hex');

    // Hash the token before storing it
    const hashedToken = createHash('sha256')
      .update(resetToken)
      .digest('hex');

    // Set expiration to 15 minutes
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    // Store hashed token in database
    await this.usersService.savePasswordResetToken(
      user.id,
      hashedToken,
      expiresAt,
    );

   const resetLink =
    `http://localhost:3001/reset-password?token=${resetToken}`;

    await this.mailService.sendPasswordResetEmail(
      user.email,
      resetLink,
    );

    return {
      message: 'If the account exists, a password reset link has been sent.',
    };
  }

  //email verified

  async register(dto: CreateUserDto) {
    // 1. Create the user
    const user = await this.usersService.create(dto);

    // 2. Generate a verification token
    const verificationToken = randomBytes(32).toString('hex');

    // 3. Hash the token before storing it
    const hashedToken = createHash('sha256')
      .update(verificationToken)
      .digest('hex');

    // 4. Set token expiry to 24 hours
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    // 5. Save the hashed token in the database
    await this.usersService.saveEmailVerificationToken(
      user.id,
      hashedToken,
      expiresAt,
    );  

    // 6. Create the verification link
    const verificationLink =
      `http://localhost:3000/auth/verify-email?token=${verificationToken}`;

    // 7. Send verification email
    await this.mailService.sendVerificationEmail(
      user.email,
      verificationLink,
    );

    return {
      message: 'Registration successful. Please check your email to verify your account.',
    };
  }

  //verify Email

  async verifyEmail(token: string) {
    // Hash the token received from the email link
    const hashedToken = createHash('sha256')
      .update(token)
      .digest('hex');

    // Find the user with a valid verification token
    const user =
      await this.usersService.findByEmailVerificationToken(hashedToken);

    if (!user) {
      throw new BadRequestException(
        'Invalid or expired verification link',
      );
    }

    // Mark the email as verified
    await this.usersService.verifyEmail(user.id);

    return {
      message: 'Email verified successfully. You can now log in.',
    };
  }

  //reset-password
  
  async resetPassword(resetToken: string, newPassword: string) {
    // Hash the token received from the user
    const hashedToken = createHash('sha256')
      .update(resetToken)
      .digest('hex');

    // Find the user with this token
    const user = await this.prisma.user.findFirst({
      where: {
        resetPasswordToken: hashedToken,
        resetPasswordExpires: {
          gt: new Date(),
        },
      },
    });

    if (!user) {
      throw new BadRequestException(
        'Invalid or expired password reset token',
      );
    }

    // Hash the new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password and invalidate existing sessions
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        resetPasswordToken: null,
        resetPasswordExpires: null,
        refreshToken: null,
        tokenVersion: {
          increment: 1,
        },
      },
    });

    return {
      message: 'Password reset successfully',
    };
  }

  //send test email
  // async testEmail(email: string) {
  //   await this.mailService.sendTestEmail(email);

  //   return {
  //     message: 'Test email sent successfully',
  //   };
  // }
  //login
  async login(dto: LoginUserDto) {
    // Find user by email
    const user = await this.usersService.findByEmail(dto.email);

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(
      dto.password,
      user.password,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }
    if (!user.isEmailVerified) {
      throw new UnauthorizedException(
        'Please verify your email before logging in.',
      );
    }
    // Generate JWT token
    const tokens = await this.generateTokens(
      user.id,
      user.email,
      user.role,
      user.tokenVersion,
    );

    return {
      message: 'Login successful',
      ...tokens,
      };
  }

  async logout(userId: number) {
    await this.usersService.invalidateUserTokens(userId);

    return {
      message: 'Logout successful. All tokens have been revoked.',
    };
  }



}
