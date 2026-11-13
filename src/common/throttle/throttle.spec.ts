import { HttpException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Throttle, ThrottleGuard } from './throttle.js';

class TestController {
  @Throttle({ default: { limit: 2, ttl: 1000 } })
  strict() {}
  loose() {}
}

function context(handler: () => void, ip = '1.1.1.1') {
  const headers: Record<string, string> = {};
  const ctx = {
    getType: () => 'http',
    getHandler: () => handler,
    getClass: () => TestController,
    switchToHttp: () => ({
      getRequest: () => ({ ip }),
      getResponse: () => ({ setHeader: (k: string, v: string) => (headers[k] = v) }),
    }),
  } as unknown as ExecutionContext;
  return { ctx, headers };
}

describe('ThrottleGuard', () => {
  let guard: ThrottleGuard;
  // The guard only reads metadata from these functions; it never calls them.
  // oxlint-disable-next-line typescript/unbound-method
  const { strict, loose } = TestController.prototype;

  beforeEach(() => {
    vi.useFakeTimers();
    guard = new ThrottleGuard(new Reflector());
  });
  afterEach(() => vi.useRealTimers());

  it('allows up to the limit, then answers 429 with Retry-After', () => {
    expect(guard.canActivate(context(strict).ctx)).toBe(true);
    expect(guard.canActivate(context(strict).ctx)).toBe(true);
    const { ctx, headers } = context(strict);
    expect(() => guard.canActivate(ctx)).toThrow(HttpException);
    try {
      guard.canActivate(ctx);
    } catch (e) {
      expect((e as HttpException).getStatus()).toBe(429);
    }
    expect(headers['Retry-After']).toBe('1');
  });

  it('resets after the window', () => {
    guard.canActivate(context(strict).ctx);
    guard.canActivate(context(strict).ctx);
    vi.advanceTimersByTime(1000);
    expect(guard.canActivate(context(strict).ctx)).toBe(true);
  });

  it('counts each IP and each route separately', () => {
    guard.canActivate(context(strict).ctx);
    guard.canActivate(context(strict).ctx);
    expect(guard.canActivate(context(strict, '2.2.2.2').ctx)).toBe(true);
    expect(guard.canActivate(context(loose).ctx)).toBe(true);
  });

  it('uses 10 per minute when a route has no @Throttle', () => {
    for (let i = 0; i < 10; i++) guard.canActivate(context(loose).ctx);
    expect(() => guard.canActivate(context(loose).ctx)).toThrow(HttpException);
  });
});
