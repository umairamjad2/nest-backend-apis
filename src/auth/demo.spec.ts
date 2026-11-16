import { describe, expect, it, vi } from 'vitest';
import { ServiceUnavailableException } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { DEMO_EMAIL_DOMAIN, MAX_ACTIVE_DEMOS, demoTasks, isDemoEmail } from './demo.js';

describe('demo helpers', () => {
  it('recognises demo emails only', () => {
    expect(isDemoEmail(`demo-abc@${DEMO_EMAIL_DOMAIN}`)).toBe(true);
    expect(isDemoEmail(`Demo-ABC@${DEMO_EMAIL_DOMAIN.toUpperCase()}`)).toBe(true);
    expect(isDemoEmail('someone@gmail.com')).toBe(false);
    expect(isDemoEmail(`x@evil-${DEMO_EMAIL_DOMAIN}`)).toBe(false);
  });

  it('builds sample tasks with due dates relative to today (midnight UTC)', () => {
    const tasks = demoTasks(new Date('2026-11-16T15:30:00Z'));
    const overdue = tasks.find((t) => t.title === 'Fix the login redirect bug');
    expect(overdue?.dueDate?.toISOString()).toBe('2026-11-15T00:00:00.000Z');
    // Covers every status, so the dashboard and board have something in each column
    expect(new Set(tasks.map((t) => t.status))).toEqual(new Set(['TODO', 'IN_PROGRESS', 'DONE']));
  });
});

describe('AuthService.startDemo', () => {
  function setup(activeDemos = 0) {
    const prisma = {
      user: {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        count: vi.fn().mockResolvedValue(activeDemos),
        create: vi.fn().mockImplementation(({ data }) =>
          Promise.resolve({ id: 7, email: data.email, role: 'USER', tokenVersion: 0 }),
        ),
      },
    };
    const usersService = { updateRefreshToken: vi.fn() };
    const jwtService = { signAsync: vi.fn().mockResolvedValue('signed.jwt') };
    const config = { get: vi.fn().mockReturnValue('secret') };
    const service = new AuthService(
      usersService as never,
      jwtService as never,
      config as never,
      prisma as never,
      {} as never,
    );
    return { service, prisma, usersService };
  }

  it('creates a verified demo user with sample tasks and returns tokens', async () => {
    const { service, prisma, usersService } = setup();

    const result = await service.startDemo();

    const { data } = prisma.user.create.mock.calls[0][0];
    expect(data.email).toMatch(new RegExp(`^demo-[0-9a-f]{12}@${DEMO_EMAIL_DOMAIN.replace(/\./g, '\\.')}$`));
    expect(data.isEmailVerified).toBe(true);
    expect(data.role).toBeUndefined(); // default USER, never ADMIN
    expect(data.tasks.create.length).toBeGreaterThan(0);
    expect(usersService.updateRefreshToken).toHaveBeenCalledWith(7, expect.any(String), expect.any(String));
    expect(result).toMatchObject({ access_token: 'signed.jwt', refresh_token: 'signed.jwt' });
  });

  it('deletes expired demo accounts only', async () => {
    const { service, prisma } = setup();
    await service.startDemo();

    const { where } = prisma.user.deleteMany.mock.calls[0][0];
    expect(where.email).toEqual({ endsWith: `@${DEMO_EMAIL_DOMAIN}` });
    expect(where.createdAt.lt).toBeInstanceOf(Date);
  });

  it('refuses when too many demos are active', async () => {
    const { service, prisma } = setup(MAX_ACTIVE_DEMOS);
    await expect(service.startDemo()).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });
});
