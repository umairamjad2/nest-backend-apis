import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

/** Same as the refresh token's expiry. Every refresh pushes it forward again. */
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Logging in on an 11th device ends the least recently used session. */
export const MAX_SESSIONS_PER_USER = 10;

export interface SessionMeta {
  userAgent?: string;
  ipAddress?: string;
}

export interface NewSession extends SessionMeta {
  id: string;
  userId: number;
  refreshTokenHash: string;
  refreshTokenJti: string;
}

/** One row per logged-in device. See the Session model in prisma/schema.prisma. */
@Injectable()
export class SessionsService {
  constructor(private prisma: PrismaService) {}

  async create(session: NewSession) {
    const now = new Date();

    // Drop this user's expired sessions, then make room under the cap.
    await this.prisma.session.deleteMany({
      where: { userId: session.userId, expiresAt: { lte: now } },
    });

    const active = await this.prisma.session.findMany({
      where: { userId: session.userId },
      orderBy: { lastUsedAt: 'desc' },
      select: { id: true },
    });
    const overflow = active.slice(MAX_SESSIONS_PER_USER - 1).map((s) => s.id);
    if (overflow.length > 0) {
      await this.prisma.session.deleteMany({ where: { id: { in: overflow } } });
    }

    return this.prisma.session.create({
      data: {
        ...session,
        // A user agent can be any length; don't store an unbounded string.
        userAgent: session.userAgent?.slice(0, 512),
        expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
      },
    });
  }

  /** The session with its user, or null if it's missing or expired. */
  async findActive(id: string) {
    const session = await this.prisma.session.findUnique({
      where: { id },
      include: { user: { select: { id: true, email: true, role: true } } },
    });

    if (!session || session.expiresAt <= new Date()) return null;
    return session;
  }

  /**
   * Swaps in a new refresh token, only if `oldJti` is still the current one.
   * Returns false when a concurrent refresh rotated it first.
   */
  async rotate(id: string, oldJti: string, newHash: string, newJti: string) {
    const now = new Date();
    const { count } = await this.prisma.session.updateMany({
      where: { id, refreshTokenJti: oldJti, expiresAt: { gt: now } },
      data: {
        refreshTokenHash: newHash,
        refreshTokenJti: newJti,
        lastUsedAt: now,
        expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
      },
    });
    return count === 1;
  }

  /** Active sessions, most recently used first. Never returns token hashes. */
  listForUser(userId: number) {
    return this.prisma.session.findMany({
      where: { userId, expiresAt: { gt: new Date() } },
      orderBy: { lastUsedAt: 'desc' },
      select: {
        id: true,
        userAgent: true,
        ipAddress: true,
        createdAt: true,
        lastUsedAt: true,
      },
    });
  }

  /** Ends one session. Scoped to the user, so nobody can end someone else's. */
  async revoke(userId: number, id: string) {
    const { count } = await this.prisma.session.deleteMany({ where: { id, userId } });
    return count === 1;
  }

  /** Ends every session of the user, except `keepId` if given. Returns how many ended. */
  async revokeAll(userId: number, keepId?: string) {
    const { count } = await this.prisma.session.deleteMany({
      where: { userId, ...(keepId ? { id: { not: keepId } } : {}) },
    });
    return count;
  }
}
