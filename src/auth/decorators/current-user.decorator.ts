import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

/** What JwtStrategy.validate() puts on req.user. */
export interface AuthenticatedUser {
  userId: number;
  email: string;
  role: 'ADMIN' | 'USER';
}

/**
 * The logged-in user, for routes behind JwtAuthGuard.
 * Usage: findAll(@CurrentUser() user: AuthenticatedUser)
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser =>
    ctx.switchToHttp().getRequest<{ user: AuthenticatedUser }>().user,
);
