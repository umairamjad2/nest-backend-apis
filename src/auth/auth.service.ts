
import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service.js';
import { LoginUserDto } from '../users/dto/login-user.dto.js';
import * as bcrypt from 'bcrypt';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private configService: ConfigService,
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
