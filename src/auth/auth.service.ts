import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { DEMO_EMAIL_DOMAIN, DEMO_TTL_MS, MAX_ACTIVE_DEMOS, demoTasks, isDemoEmail } from './demo.js';

import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service.js';
import { LoginUserDto } from '../users/dto/login-user.dto.js';
import * as bcrypt from 'bcrypt';
import { ConfigService } from '@nestjs/config';
import { randomBytes, randomUUID, createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import { MailService } from '../mail/mail.service.js';
import { CreateUserDto } from '../users/dto/create-user.dto.js';
import { SessionsService, type SessionMeta } from './sessions.service.js';

/** What both tokens carry, plus `sid`: the Session row this login belongs to. */
interface TokenUser {
  id: number;
  email: string;
  role: string;
}

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private prisma: PrismaService,
    private mailService: MailService,
    private sessionsService: SessionsService,
  ) {}

  private frontendUrl() {
    return (
      this.configService.get<string>('FRONTEND_URL') ?? 'http://localhost:3001'
    ).replace(/\/+$/, '');
  }

  // SHA-256, not bcrypt: bcrypt only reads the first 72 bytes, which are the same for a user's JWTs
  private hashRefreshToken(refreshToken: string) {
    return createHash('sha256').update(refreshToken).digest('hex');
  }

  // Signs a token pair for one session, without saving anything
  private async signTokens(user: TokenUser, sessionId: string) {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      sid: sessionId,
    };

    // Give every refresh token a unique ID
    const refreshTokenId = randomBytes(16).toString('hex');

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
        expiresIn: '15m',
      }),

      this.jwtService.signAsync(
        { ...payload, jti: refreshTokenId },
        {
          secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
          expiresIn: '7d',
        },
      ),
    ]);

    return {
      accessToken,
      refreshToken,
      jti: refreshTokenId,
      hash: this.hashRefreshToken(refreshToken),
    };
  }

  /** Starts a new session (one per login) and returns its token pair. */
  async startSession(user: TokenUser, meta: SessionMeta = {}) {
    const sessionId = randomUUID();
    const tokens = await this.signTokens(user, sessionId);

    await this.sessionsService.create({
      id: sessionId,
      userId: user.id,
      refreshTokenHash: tokens.hash,
      refreshTokenJti: tokens.jti,
      ...meta,
    });

    return {
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
    };
  }

   //Refresh Token
  async refreshTokens(refreshToken: string) {
    let payload: {
      sub: number;
      sid?: string;
      jti: string;
    };

    try {
      payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // Tokens issued before sessions existed have no sid
    const session = payload.sid
      ? await this.sessionsService.findActive(payload.sid)
      : null;

    if (!session || session.userId !== payload.sub) {
      throw new UnauthorizedException('Session expired or signed out');
    }

    // First: fast jti check catches reuse immediately
    if (session.refreshTokenJti !== payload.jti) {
      // An old token was sent again (possible theft): end this session
      await this.sessionsService.revoke(session.userId, session.id);
      throw new UnauthorizedException('Refresh token reuse detected');
    }

    // Second: compare against the stored hash
    if (this.hashRefreshToken(refreshToken) !== session.refreshTokenHash) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const next = await this.signTokens(session.user, session.id);

    const rotated = await this.sessionsService.rotate(
      session.id,
      payload.jti,
      next.hash,
      next.jti,
    );

    // Lost a race with a concurrent refresh — usually a double-click, so keep the session
    if (!rotated) {
      throw new UnauthorizedException('Refresh token already used');
    }

    return {
      access_token: next.accessToken,
      refresh_token: next.refreshToken,
    };
  }

  /** The user's logged-in devices, with the one making the request marked `current`. */
  async listSessions(userId: number, currentSessionId: string) {
    const sessions = await this.sessionsService.listForUser(userId);
    return sessions.map((session) => ({
      ...session,
      current: session.id === currentSessionId,
    }));
  }

  async revokeSession(userId: number, sessionId: string) {
    const revoked = await this.sessionsService.revoke(userId, sessionId);
    if (!revoked) {
      throw new NotFoundException('Session not found');
    }
    return { message: 'Session signed out' };
  }

  async revokeOtherSessions(userId: number, currentSessionId: string) {
    const count = await this.sessionsService.revokeAll(userId, currentSessionId);
    return {
      message: count === 1 ? 'Signed out 1 other device' : `Signed out ${count} other devices`,
      count,
    };
  }

  /**
   * Checks a logged-in user's own password before a sensitive change.
   * A wrong password is 400, not 401, so the frontend doesn't treat it as an expired token.
   */
  private async verifyOwnPassword(userId: number, password: string, demoMessage: string) {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new UnauthorizedException('Account not found');
    }
    // Demo accounts have a random password nobody knows
    if (isDemoEmail(user.email)) {
      throw new ForbiddenException(demoMessage);
    }
    if (!(await bcrypt.compare(password, user.password))) {
      throw new BadRequestException('Current password is incorrect');
    }
    return user;
  }

  /** Changes the password and signs out every other device. This one stays logged in. */
  async changePassword(
    userId: number,
    currentSessionId: string,
    currentPassword: string,
    newPassword: string,
  ) {
    const user = await this.verifyOwnPassword(
      userId,
      currentPassword,
      "Demo accounts can't change their password.",
    );

    if (currentPassword === newPassword) {
      throw new BadRequestException('The new password must be different from the current one');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        password: await bcrypt.hash(newPassword, 10),
        // A reset link requested before the change shouldn't still work after it
        resetPasswordToken: null,
        resetPasswordExpires: null,
      },
    });
    await this.sessionsService.revokeAll(user.id, currentSessionId);

    // Tell the owner, in case it wasn't them. A failed email mustn't undo the change;
    // MailService already logs the failure.
    await this.mailService
      .sendPasswordChangedEmail(user.email, `${this.frontendUrl()}/forgot-password`)
      .catch(() => undefined);

    return { message: 'Password changed. Other devices have been signed out.' };
  }

  /** Deletes the user's own account, with all its tasks and sessions. */
  async deleteAccount(userId: number, password: string) {
    const user = await this.verifyOwnPassword(
      userId,
      password,
      'Demo accounts are deleted automatically after 24 hours.',
    );

    if (user.role === 'ADMIN') {
      const admins = await this.prisma.user.count({ where: { role: 'ADMIN' } });
      if (admins <= 1) {
        throw new BadRequestException(
          "You're the only admin. Make someone else an admin before deleting your account.",
        );
      }
    }

    // Tasks and sessions are removed by the cascade
    await this.prisma.user.delete({ where: { id: user.id } });

    return { message: 'Your account has been deleted.' };
  }

  //forget password 
  async forgotPassword(email: string) {
    const genericResponse = {
      message: 'If the account exists, a password reset link has been sent.',
    };

    const user = await this.usersService.findByEmail(email);

    // Same response either way, so this route can't reveal which emails are registered.
    // Demo addresses can't receive mail, so don't try.
    if (!user || isDemoEmail(user.email)) {
      return genericResponse;
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

    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') ?? 'http://localhost:3001';
    const resetLink = `${frontendUrl}/reset-password?token=${resetToken}`;

    await this.mailService.sendPasswordResetEmail(
      user.email,
      resetLink,
    );

    return genericResponse;
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

    // 6. Create the verification link. It opens the frontend's /verify-email page,
    // which calls GET /auth/verify-email and shows the result.
    const frontendUrl = (
      this.configService.get<string>('FRONTEND_URL') ?? 'http://localhost:3001'
    ).replace(/\/+$/, '');
    const verificationLink = `${frontendUrl}/verify-email?token=${verificationToken}`;

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

    // Update password and sign out every device
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        resetPasswordToken: null,
        resetPasswordExpires: null,
      },
    });
    await this.sessionsService.revokeAll(user.id);

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
  async login(dto: LoginUserDto, meta: SessionMeta = {}) {
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
    // New session for this device; other devices stay logged in
    const tokens = await this.startSession(user, meta);

    return {
      message: 'Login successful',
      ...tokens,
      };
  }

  /** Create a throwaway demo account with sample tasks and log it in. See demo.ts. */
  async startDemo(meta: SessionMeta = {}) {
    const demoUsers = { email: { endsWith: `@${DEMO_EMAIL_DOMAIN}` } };

    // Clean up expired demos first (their tasks are deleted by the cascade)
    await this.prisma.user.deleteMany({
      where: { ...demoUsers, createdAt: { lt: new Date(Date.now() - DEMO_TTL_MS) } },
    });

    const active = await this.prisma.user.count({ where: demoUsers });
    if (active >= MAX_ACTIVE_DEMOS) {
      throw new ServiceUnavailableException(
        'The demo is busy right now. Please try again later or create an account.',
      );
    }

    // Nobody knows this password, so the account can only be used through this session.
    const password = await bcrypt.hash(randomBytes(32).toString('hex'), 10);

    const user = await this.prisma.user.create({
      data: {
        name: 'Demo User',
        email: `demo-${randomBytes(6).toString('hex')}@${DEMO_EMAIL_DOMAIN}`,
        password,
        isEmailVerified: true,
        tasks: { create: demoTasks() },
      },
    });

    const tokens = await this.startSession(user, meta);

    return {
      message: 'Demo started',
      ...tokens,
    };
  }

  /** Ends this device's session only. Other devices stay logged in. */
  async logout(userId: number, sessionId: string) {
    await this.sessionsService.revoke(userId, sessionId);

    return {
      message: 'Logout successful.',
    };
  }
}
