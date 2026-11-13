// Checked once at startup, so a missing variable fails the deploy instead of the first login
const REQUIRED = [
  'DATABASE_URL',
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
  'MAIL_HOST',
  'MAIL_PORT',
  'MAIL_USER',
  'MAIL_PASSWORD',
] as const;

// Only required in production, where the localhost fallbacks would be wrong
const REQUIRED_IN_PRODUCTION = ['FRONTEND_URL'] as const;

export function validateEnv(config: Record<string, unknown>) {
  const isProduction = config.NODE_ENV === 'production';
  const required: readonly string[] = isProduction
    ? [...REQUIRED, ...REQUIRED_IN_PRODUCTION]
    : REQUIRED;

  const errors = required
    .filter((key) => typeof config[key] !== 'string' || config[key] === '')
    .map((key) => `${key} is missing`);

  if (config.MAIL_PORT !== undefined && Number.isNaN(Number(config.MAIL_PORT))) {
    errors.push('MAIL_PORT must be a number');
  }

  const cookiePath = config.REFRESH_COOKIE_PATH;
  if (cookiePath !== undefined && (typeof cookiePath !== 'string' || !cookiePath.startsWith('/'))) {
    errors.push('REFRESH_COOKIE_PATH must start with "/" (for example /api/auth)');
  }

  if (isProduction) {
    for (const key of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET']) {
      const value = config[key];
      if (typeof value === 'string' && value.length < 32) {
        errors.push(`${key} must be at least 32 characters in production`);
      }
    }
    if (config.JWT_ACCESS_SECRET && config.JWT_ACCESS_SECRET === config.JWT_REFRESH_SECRET) {
      errors.push('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different');
    }
  }

  if (errors.length > 0) {
    throw new Error(`Invalid environment variables:\n- ${errors.join('\n- ')}`);
  }

  return config;
}
