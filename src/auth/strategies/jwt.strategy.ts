import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { SessionsService } from '../sessions.service.js';
import type { AuthenticatedUser } from '../decorators/current-user.decorator.js';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private sessionsService: SessionsService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_ACCESS_SECRET')!,
    });
  }

  // The access token is only valid while its session exists, so signing a device out
  // (or deleting the account) cuts it off at once, not when the token expires.
  async validate(payload: { sub: number; sid?: string }): Promise<AuthenticatedUser> {
    const session = payload.sid
      ? await this.sessionsService.findActive(payload.sid)
      : null;

    if (!session || session.userId !== payload.sub) {
      throw new UnauthorizedException('Token has been revoked');
    }

    // Role comes from the database, so a role change applies without logging in again
    return {
      userId: session.user.id,
      email: session.user.email,
      role: session.user.role,
      sessionId: session.id,
    };
  }
}
