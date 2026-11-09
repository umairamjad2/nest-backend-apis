import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';

import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import * as bcrypt from 'bcrypt';
import { LoginUserDto } from './dto/login-user.dto.js';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  //RefreshToken
  async updateRefreshToken(
    userId: number,
    hashedRefreshToken: string | null,
    jti: string | null,
  ) {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        refreshToken: hashedRefreshToken,
        refreshTokenJti: jti,
      },
    });
  }
  // Replaces the token only if oldJti is still current, so one token can't be rotated twice
  async rotateRefreshToken(
    userId: number,
    oldJti: string,
    newHash: string,
    newJti: string,
  ) {
    const { count } = await this.prisma.user.updateMany({
      where: { id: userId, refreshTokenJti: oldJti },
      data: { refreshToken: newHash, refreshTokenJti: newJti },
    });

    return count === 1;
  }
  async invalidateUserTokens(userId: number) {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        refreshToken: null,
        refreshTokenJti: null,
        tokenVersion: {
          increment: 1,
        },
      },
    });
  }
  //Save Email Verification
  async saveEmailVerificationToken(
    userId: number,
    hashedToken: string,
    expiresAt: Date,
  ) {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        emailVerificationToken: hashedToken,
        emailVerificationExpires: expiresAt,
      },
    }); 
  }

  //Email Verification Token
  async findByEmailVerificationToken(hashedToken: string) {
    return this.prisma.user.findFirst({
      where: {
        emailVerificationToken: hashedToken,
        emailVerificationExpires: {
          gt: new Date(),
        },
      },
    });
  }

  //Verify Email
  async verifyEmail(userId: number) {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        isEmailVerified: true,
        emailVerificationToken: null,
        emailVerificationExpires: null,
      },
      select: {
        id: true,
        name: true,
        email: true,
        isEmailVerified: true,
      },
    });
  }

  //Forget Password
  async savePasswordResetToken(
    userId: number,
    hashedToken: string,
    expiresAt: Date,
    ) {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        resetPasswordToken: hashedToken,
        resetPasswordExpires: expiresAt,
      },
    });
  }
  //login
  async login(dto: LoginUserDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) {
      throw new NotFoundException('Invalid email or password');
    }

    const isPasswordValid = await bcrypt.compare(
      dto.password,
      user.password,
    );

    if (!isPasswordValid) {
      throw new NotFoundException('Invalid email or password');
    }

    return {
      message: 'Login successful',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        createdAt: user.createdAt,
      },
    };
  }

  async findById(id: number) {
    return this.prisma.user.findUnique({
      where: { id },
    });
  }
  async findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
    });
  }

  async findAll() {
    return this.prisma.user.findMany({
      select: {
        id: true,
        name: true, 
        email: true,
        createdAt: true,
      },
    });
  }

  async findOne(id: number) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  

  async create(dto: CreateUserDto) {
    
    try {
     const hashedPassword = await bcrypt.hash(dto.password, 10);
      return await this.prisma.user.create({
        data: {
          name: dto.name,
          email: dto.email,
          password: hashedPassword,
        },
        select: {
          id: true,
          name: true,
          email: true,
          createdAt: true,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Email already exists');
      }
      throw error;
    }
  }

  async update(id: number, data: Partial<CreateUserDto>) {
    try {
      return await this.prisma.user.update({
        where: { id },
        data,
        select: {
          id: true,
          name: true,
          email: true,
          createdAt: true,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException('User not found');
      }
      throw error;
    }
  }

  async remove(id: number) {
    try {
      await this.prisma.user.delete({ where: { id } });
      return { message: 'User deleted successfully' };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException('User not found');
      }
      throw error;
    }
  }

}