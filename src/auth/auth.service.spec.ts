import { describe, expect, it, vi, beforeAll } from 'vitest';
import {
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service.js';
import { DEMO_EMAIL_DOMAIN } from './demo.js';

const SECRETS: Record<string, string> = {
  JWT_ACCESS_SECRET: 'access-secret',
  JWT_REFRESH_SECRET: 'refresh-secret',
  FRONTEND_URL: 'http://localhost:3001',
};

let passwordHash: string;
beforeAll(async () => {
  passwordHash = await bcrypt.hash('Password123', 4); // low cost: fast tests
});

function setup(userOverrides: Record<string, unknown> = {}) {
  const user = {
    id: 1,
    email: 'jane@example.com',
    role: 'USER',
    password: passwordHash,
    ...userOverrides,
  };

  const usersService = { findById: vi.fn().mockResolvedValue(user) };
  const prisma = {
    user: {
      update: vi.fn().mockResolvedValue(user),
      delete: vi.fn().mockResolvedValue(user),
      count: vi.fn().mockResolvedValue(1),
      findFirst: vi.fn().mockResolvedValue(user),
    },
  };
  const mailService = { sendPasswordChangedEmail: vi.fn().mockResolvedValue(undefined) };
  const sessionsService = {
    create: vi.fn(),
    findActive: vi.fn(),
    rotate: vi.fn().mockResolvedValue(true),
    revoke: vi.fn().mockResolvedValue(true),
    revokeAll: vi.fn().mockResolvedValue(2),
    listForUser: vi.fn(),
  };
  const config = { get: vi.fn((key: string) => SECRETS[key]) };
  const jwtService = new JwtService({});

  const service = new AuthService(
    usersService as never,
    jwtService,
    config as never,
    prisma as never,
    mailService as never,
    sessionsService as never,
  );

  return { service, user, usersService, prisma, mailService, sessionsService, jwtService };
}

describe('AuthService sessions', () => {
  /** Logs in once and returns the refresh token plus the Session row that create() received. */
  async function loggedIn(ctx: ReturnType<typeof setup>) {
    const tokens = await ctx.service.startSession(ctx.user);
    const row = ctx.sessionsService.create.mock.calls[0][0];
    ctx.sessionsService.findActive.mockResolvedValue({
      ...row,
      expiresAt: new Date(Date.now() + 60_000),
      user: { id: ctx.user.id, email: ctx.user.email, role: ctx.user.role },
    });
    return { tokens, row };
  }

  it('puts the session id in both tokens', async () => {
    const ctx = setup();
    const { tokens, row } = await loggedIn(ctx);

    const access = ctx.jwtService.decode(tokens.access_token);
    const refresh = ctx.jwtService.decode(tokens.refresh_token);
    expect(access.sid).toBe(row.id);
    expect(refresh.sid).toBe(row.id);
    expect(refresh.jti).toBe(row.refreshTokenJti);
  });

  it('rotates the refresh token within the same session', async () => {
    const ctx = setup();
    const { tokens, row } = await loggedIn(ctx);

    const next = await ctx.service.refreshTokens(tokens.refresh_token);

    expect(next.refresh_token).not.toBe(tokens.refresh_token);
    expect(ctx.sessionsService.rotate).toHaveBeenCalledWith(
      row.id,
      row.refreshTokenJti,
      expect.any(String),
      expect.any(String),
    );
  });

  it('ends only that session when an old refresh token is reused', async () => {
    const ctx = setup();
    const { tokens, row } = await loggedIn(ctx);
    // The session has moved on to a newer token
    ctx.sessionsService.findActive.mockResolvedValue({
      ...(await ctx.sessionsService.findActive()),
      refreshTokenJti: 'a-newer-jti',
    });

    await expect(ctx.service.refreshTokens(tokens.refresh_token)).rejects.toThrow(
      'Refresh token reuse detected',
    );
    expect(ctx.sessionsService.revoke).toHaveBeenCalledWith(ctx.user.id, row.id);
    expect(ctx.sessionsService.revokeAll).not.toHaveBeenCalled();
  });

  it('rejects a refresh for a signed-out session', async () => {
    const ctx = setup();
    const { tokens } = await loggedIn(ctx);
    ctx.sessionsService.findActive.mockResolvedValue(null);

    await expect(ctx.service.refreshTokens(tokens.refresh_token)).rejects.toThrow(
      'Session expired or signed out',
    );
  });

  it('rejects refresh tokens from before sessions existed (no sid)', async () => {
    const ctx = setup();
    const legacy = await ctx.jwtService.signAsync(
      { sub: 1, jti: 'x' },
      { secret: SECRETS.JWT_REFRESH_SECRET },
    );

    await expect(ctx.service.refreshTokens(legacy)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(ctx.sessionsService.findActive).not.toHaveBeenCalled();
  });

  it('keeps the session when it loses a race with a concurrent refresh', async () => {
    const ctx = setup();
    const { tokens } = await loggedIn(ctx);
    ctx.sessionsService.rotate.mockResolvedValue(false);

    await expect(ctx.service.refreshTokens(tokens.refresh_token)).rejects.toThrow(
      'Refresh token already used',
    );
    expect(ctx.sessionsService.revoke).not.toHaveBeenCalled();
  });

  it('logout ends only the current session', async () => {
    const ctx = setup();
    await ctx.service.logout(1, 'session-a');

    expect(ctx.sessionsService.revoke).toHaveBeenCalledWith(1, 'session-a');
    expect(ctx.sessionsService.revokeAll).not.toHaveBeenCalled();
  });

  it('marks the current session in the list', async () => {
    const ctx = setup();
    ctx.sessionsService.listForUser.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);

    const sessions = await ctx.service.listSessions(1, 'b');

    expect(sessions).toEqual([
      { id: 'a', current: false },
      { id: 'b', current: true },
    ]);
  });
});

describe('AuthService.changePassword', () => {
  it('saves the new password and signs out every other device', async () => {
    const ctx = setup();

    await ctx.service.changePassword(1, 'current-session', 'Password123', 'NewPassword456');

    const { data } = ctx.prisma.user.update.mock.calls[0][0];
    expect(await bcrypt.compare('NewPassword456', data.password)).toBe(true);
    expect(data.resetPasswordToken).toBeNull();
    expect(ctx.sessionsService.revokeAll).toHaveBeenCalledWith(1, 'current-session');
    expect(ctx.mailService.sendPasswordChangedEmail).toHaveBeenCalledWith(
      'jane@example.com',
      'http://localhost:3001/forgot-password',
    );
  });

  it('rejects a wrong current password with 400, not 401', async () => {
    const ctx = setup();

    await expect(
      ctx.service.changePassword(1, 's', 'WrongPassword', 'NewPassword456'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(ctx.prisma.user.update).not.toHaveBeenCalled();
  });

  it('rejects a new password equal to the current one', async () => {
    const ctx = setup();

    await expect(
      ctx.service.changePassword(1, 's', 'Password123', 'Password123'),
    ).rejects.toThrow('must be different');
  });

  it('refuses demo accounts', async () => {
    const ctx = setup({ email: `demo-abc@${DEMO_EMAIL_DOMAIN}` });

    await expect(
      ctx.service.changePassword(1, 's', 'Password123', 'NewPassword456'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('still succeeds when the notification email fails', async () => {
    const ctx = setup();
    ctx.mailService.sendPasswordChangedEmail.mockRejectedValue(new Error('SMTP down'));

    await expect(
      ctx.service.changePassword(1, 's', 'Password123', 'NewPassword456'),
    ).resolves.toMatchObject({ message: expect.any(String) });
  });
});

describe('AuthService.deleteAccount', () => {
  it('deletes the account when the password is right', async () => {
    const ctx = setup();

    await ctx.service.deleteAccount(1, 'Password123');

    expect(ctx.prisma.user.delete).toHaveBeenCalledWith({ where: { id: 1 } });
  });

  it('keeps the account when the password is wrong', async () => {
    const ctx = setup();

    await expect(ctx.service.deleteAccount(1, 'nope')).rejects.toBeInstanceOf(BadRequestException);
    expect(ctx.prisma.user.delete).not.toHaveBeenCalled();
  });

  it('refuses to delete the only admin', async () => {
    const ctx = setup({ role: 'ADMIN' });
    ctx.prisma.user.count.mockResolvedValue(1);

    await expect(ctx.service.deleteAccount(1, 'Password123')).rejects.toThrow('only admin');
    expect(ctx.prisma.user.delete).not.toHaveBeenCalled();
  });

  it('lets an admin go when another admin remains', async () => {
    const ctx = setup({ role: 'ADMIN' });
    ctx.prisma.user.count.mockResolvedValue(2);

    await ctx.service.deleteAccount(1, 'Password123');

    expect(ctx.prisma.user.delete).toHaveBeenCalled();
  });
});

describe('AuthService.resetPassword', () => {
  it('signs out every device', async () => {
    const ctx = setup();

    await ctx.service.resetPassword('reset-token', 'NewPassword456');

    expect(ctx.sessionsService.revokeAll).toHaveBeenCalledWith(1);
  });
});
