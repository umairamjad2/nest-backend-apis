import { NestFactory } from '@nestjs/core';
import { AppModule, ObserveInstrument } from './app.module.js';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmetImport, { type HelmetOptions } from 'helmet';
import type { RequestHandler } from 'express';

// Vercel's compiler reads helmet's CommonJS types, where the default import is the whole
// module object rather than the function. At runtime both point to the same function.
type Helmet = (options?: Readonly<HelmetOptions>) => RequestHandler;
const helmetModule = helmetImport as unknown as Helmet | { default: Helmet };
const helmet = typeof helmetModule === 'function' ? helmetModule : helmetModule.default;

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    instrument: ObserveInstrument,
  });

  // Security headers. CSP is off in development so the Swagger UI loads.
  app.use(
    helmet({
      contentSecurityPolicy: process.env.NODE_ENV === 'production' ? undefined : false,
    }),
  );

  // Reads the refresh_token cookie into req.cookies
  app.use(cookieParser());

  // Lets the browser frontend call this API and send its cookies
  app.enableCors({
    origin: process.env.FRONTEND_URL ?? 'http://localhost:3001',
    credentials: true,
  });

  app.useGlobalPipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
);

  // API docs are for development only
  if (process.env.NODE_ENV !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('NestJS Learning API')
      .setDescription('Authentication and user management API')
      .setVersion('1.0')
      .addBearerAuth()
      .addCookieAuth('refresh_token')
      .build();

    SwaggerModule.setup('api', app, SwaggerModule.createDocument(app, swaggerConfig), {
      swaggerOptions: { persistAuthorization: true },
    });
  }

  await app.listen(process.env.PORT ?? 3000);
}

// Not a top-level await: Vercel waits for this file to finish loading before it
// sends requests to the server, so awaiting listen() here hangs every request.
bootstrap().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
