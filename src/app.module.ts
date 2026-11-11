import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { createObserveModule } from '@nestjs/observe';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { UsersModule } from './users/users.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { AuthModule } from './auth/auth.module.js';
import { MailModule } from './mail/mail.module.js';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { validateEnv } from './config/env.validation.js';
import { TasksModule } from './tasks/tasks.module.js';

export const { ObserveModule, ObserveInstrument } = createObserveModule();

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 10,
      },
    ]),
    // Distributed tracing, auto-correlated logs, request/job metrics, error
    // telemetry, alarms, and more — out of the box. Sign up at https://observe.nestjs.com,
    // then run `npx @nestjs/observe link` to write your key pair into .env.
    // Only enabled once the keys are set, so it never runs with placeholder credentials
    ...(process.env.OBSERVE_APP_KEY && process.env.OBSERVE_APP_SECRET
      ? [
          ObserveModule.forRoot({
            appKey: process.env.OBSERVE_APP_KEY,
            appSecret: process.env.OBSERVE_APP_SECRET,
            serviceId: 'nestjs-learning',
          }),
        ]
      : []),
    UsersModule,
     PrismaModule,
     AuthModule,
     MailModule,
     TasksModule,
  ],
  controllers: [AppController],
  providers: [AppService ,
      {
        provide: APP_GUARD,
        useClass: ThrottlerGuard,
      },
  ],
})
export class AppModule {}
