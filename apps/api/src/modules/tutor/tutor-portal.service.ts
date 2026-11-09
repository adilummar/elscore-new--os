import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService, PrismaTxClient } from '../../common/prisma/prisma.service';

import { TutorCalendarService, TutorCalendarView } from './tutor-calendar.service';

export interface TutorPortalMe {
  tutorProfileId: string;
  name: string;
  active: boolean;
}

/**
 * What a tutor sees of their own work. Every question starts from the signed-in user: there is no tutor id in any request,
 * so there is no way to ask for another tutor's classes, students or records.
 */
@Injectable()
export class TutorPortalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly calendars: TutorCalendarService,
  ) {}

  /** The tutor profile of this user, or a plain refusal when the user is not a tutor. */
  async mine(userId: string): Promise<TutorPortalMe> {
    const db = this.prisma as unknown as PrismaTxClient;
    const employee = await db.employee.findUnique({ where: { userId } });
    const profile = employee ? await db.tutorProfile.findUnique({ where: { employeeId: employee.id } }) : null;
    if (!employee || !profile) throw new NotFoundException('You do not have a tutor profile.');
    return { tutorProfileId: profile.id, name: `${employee.firstName} ${employee.lastName}`.trim(), active: profile.tutorOperationalStatus === 'ACTIVE' };
  }

  /** The tutor's own classes for a range of dates (a month at most), with the students behind them. */
  async calendar(userId: string, from: string, to: string): Promise<TutorCalendarView> {
    const me = await this.mine(userId);
    return this.calendars.calendar(me.tutorProfileId, from, to, userId, { showStudents: true });
  }
}
