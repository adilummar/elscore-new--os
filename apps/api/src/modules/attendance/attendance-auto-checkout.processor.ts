import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JOBS, QUEUES } from '../../common/queue/queue.constants';
import { format, subDays } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

const TIMEZONE = 'Asia/Kolkata';

@Processor(QUEUES.HOUSEKEEPING)
@Injectable()
export class AttendanceAutoCheckoutProcessor extends WorkerHost {
  private readonly logger = new Logger(AttendanceAutoCheckoutProcessor.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job) {
    if (job.name !== JOBS.ATTENDANCE_AUTO_CHECKOUT) {
       return;
    }
    this.logger.log('Starting Auto-Checkout Job...');
    
    const now = new Date();
    const zonedNow = toZonedTime(now, TIMEZONE);
    const targetDate = subDays(zonedNow, 1);
    const targetDateStr = format(targetDate, 'yyyy-MM-dd');

    const closureTimestampStr = `${targetDateStr}T23:59:59.999+05:30`;
    const closureTimestamp = new Date(closureTimestampStr);
    const breakClosureTimestamp = new Date(closureTimestampStr);

    const openSessions = await this.prisma.employeeAttendanceSession.findMany({
      where: {
         calendarDate: { lte: targetDateStr },
         status: { in: ['ACTIVE', 'ON_BREAK'] }
      },
      include: { events: { where: { isInvalidated: false }, orderBy: { timestamp: 'desc' } } }
    });

    this.logger.log(`Found ${openSessions.length} sessions to auto-checkout`);

    for (const session of openSessions) {
      await this.prisma.$transaction(async (tx) => {
        // Lock
        await tx.$executeRaw`SELECT 1 FROM employee_attendance_sessions WHERE id = ${session.id} FOR UPDATE`;

        let currentBreakMins = session.breakDurationMinutes;
        const eventsToCreate: any[] = [];

        if (session.status === 'ON_BREAK') {
           const lastBreak = session.events.find(e => e.eventType === 'BREAK_START');
           if (lastBreak) {
              const diff = Math.floor((breakClosureTimestamp.getTime() - lastBreak.timestamp.getTime()) / 60000);
              currentBreakMins += Math.max(0, diff);
           }
           eventsToCreate.push({
              eventType: 'AUTO_BREAK_END',
              timestamp: breakClosureTimestamp
           });
        }

        eventsToCreate.push({
           eventType: 'AUTO_CHECK_OUT',
           timestamp: closureTimestamp
        });

        const checkIn = session.events.find(e => e.eventType === 'CHECK_IN');
        let grossMins = 0;
        if (checkIn) {
           grossMins = Math.floor((closureTimestamp.getTime() - checkIn.timestamp.getTime()) / 60000);
        }
        const netMins = Math.max(0, grossMins - currentBreakMins);

        await tx.employeeAttendanceSession.update({
           where: { id: session.id },
           data: {
              status: 'AUTO_CHECKED_OUT',
              breakDurationMinutes: currentBreakMins,
              grossDurationMinutes: grossMins,
              netDurationMinutes: netMins,
              events: {
                 create: eventsToCreate
              }
           }
        });
      });
    }

    this.logger.log('Auto-Checkout Job Completed');
  }
}
