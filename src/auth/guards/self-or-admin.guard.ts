import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';

// Allows admins, or the user whose ID is in the :id route param. Use after JwtAuthGuard.
@Injectable()
export class SelfOrAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const { user, params } = context.switchToHttp().getRequest();

    return user?.role === 'ADMIN' || user?.userId === Number(params.id);
  }
}
