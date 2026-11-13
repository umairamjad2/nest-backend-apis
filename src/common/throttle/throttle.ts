import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';

// A small replacement for @nestjs/throttler. That package is CommonJS and loads the
// ESM-only @nestjs/common 12 with require(), which Vercel's runtime can't do.
// Same behaviour: a fixed window per client IP and per route.

export interface ThrottleLimit {
  limit: number; // requests allowed per window
  ttl: number; // window length in milliseconds
}

export const DEFAULT_THROTTLE: ThrottleLimit = { limit: 10, ttl: 60_000 };

const THROTTLE_KEY = 'throttle:limit';

// Same shape as @nestjs/throttler's decorator: @Throttle({ default: { limit, ttl } })
export const Throttle = (options: { default: ThrottleLimit }) =>
  SetMetadata(THROTTLE_KEY, options.default);

interface Window {
  count: number;
  resetAt: number;
}

@Injectable()
export class ThrottleGuard implements CanActivate {
  private readonly hits = new Map<string, Window>();
  private nextSweep = 0;

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') return true;

    const { limit, ttl } =
      this.reflector.getAllAndOverride<ThrottleLimit>(THROTTLE_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? DEFAULT_THROTTLE;

    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const now = Date.now();
    this.sweep(now);

    const key = `${req.ip ?? 'unknown'}:${context.getClass().name}.${context.getHandler().name}`;
    let window = this.hits.get(key);
    if (!window || window.resetAt <= now) {
      window = { count: 0, resetAt: now + ttl };
      this.hits.set(key, window);
    }
    window.count += 1;

    if (window.count > limit) {
      const retryAfter = Math.ceil((window.resetAt - now) / 1000);
      http.getResponse<Response>().setHeader('Retry-After', String(retryAfter));
      throw new HttpException('Too Many Requests', HttpStatus.TOO_MANY_REQUESTS);
    }
    return true;
  }

  // Drop expired windows now and then so the map doesn't grow forever.
  private sweep(now: number) {
    if (now < this.nextSweep) return;
    this.nextSweep = now + 60_000;
    for (const [key, window] of this.hits) {
      if (window.resetAt <= now) this.hits.delete(key);
    }
  }
}
