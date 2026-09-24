import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { RoundRobinModule } from '../../modules/round-robin/round-robin.module';
import { RoundRobinResetProcessor } from '../../modules/round-robin/round-robin.processor';

import { HousekeepingScheduler } from './housekeeping.scheduler';
import { TokenCleanupProcessor } from './processors/token-cleanup.processor';
import { QUEUES } from './queue.constants';

@Global()
@Module({
  imports: [
    RoundRobinModule,
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const appEnv = process.env.APP_ENV ?? config.get<string>('app.nodeEnv') ?? 'development';
        const prefix = `elscore-${appEnv}`;
        return {
          prefix,
          connection: new (require('ioredis').Redis)({
            host: config.get<string>('redis.host') ?? 'localhost',
            port: config.get<number>('redis.port') ?? 6379,
            password: config.get<string>('redis.password'),
            enableReadyCheck: false,
            maxRetriesPerRequest: null,
            silent: true,
            retryStrategy: () => 10000, 
          }).on('error', () => {}), 
          defaultJobOptions: {
            attempts: 3,
            backoff: {
              type: 'exponential',
              delay: 2000, 
            },
            removeOnComplete: { count: 1000 }, 
            removeOnFail: { count: 5000 },     
          },
        };
      },
    }),

    BullModule.registerQueue(
      { name: QUEUES.NOTIFICATIONS },
      { name: QUEUES.DEADLINE_MONITOR },
      { name: QUEUES.AUDIT_PROJECTION },
      { name: QUEUES.HOUSEKEEPING },
    ),
  ],
  providers: [
    TokenCleanupProcessor,
    RoundRobinResetProcessor,
    HousekeepingScheduler,
  ],
  exports: [BullModule],
})
export class QueueModule {}
