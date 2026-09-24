import { Controller, Get, HttpCode, HttpStatus, Inject } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { getQueueToken, InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QUEUES } from '../../common/queue/queue.constants';
import { Public } from '../../common/auth/decorators/public.decorator';

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUES.HOUSEKEEPING) private readonly queue: Queue,
  ) {}

  @Public() // Make it public so uptime monitors can hit it
  @Get()
  @HttpCode(HttpStatus.OK)
  async check() {
    let dbStatus = 'down';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      dbStatus = 'up';
    } catch (e) {
      dbStatus = 'down';
    }

    let redisStatus = 'down';
    try {
      const client = await this.queue.client;
      const ping = await (client as any).ping();
      if (ping === 'PONG') {
        redisStatus = 'up';
      }
    } catch (e) {
      redisStatus = 'down';
    }

    const overall = (dbStatus === 'up' && redisStatus === 'up') ? 'ok' : 'error';

    return {
      status: overall,
      api: 'up',
      database: dbStatus,
      redis: redisStatus,
    };
  }
}
