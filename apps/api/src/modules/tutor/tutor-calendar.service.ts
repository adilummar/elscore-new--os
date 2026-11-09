import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService, PrismaTxClient } from '../../common/prisma/prisma.service';
import { RbacService } from '../../common/rbac/rbac.service';

import { AvailabilityWindow, DayNumber, minutesToClock } from './tutor-availability';
import { Segment, datesBetween, dayTotals, daysBetween, describeDate, isDateString, resolveDay, timeline } from './tutor-calendar';
import { loadCalendars } from './tutor-calendar.data';

/** A calendar view can span a month at most, so one request is never a database sweep. */
export const MAX_CALENDAR_DAYS = 31;

export interface CalendarDayView {
  date: string;
  label: string;
  weekday: number;
  /** Why the tutor is away that day, if they are. */
  closed: { kind: 'LEAVE' | 'HOLIDAY' | 'DAY_OFF'; note: string } | null;
  /** False when the tutor has set no weekly hours at all. */
  configured: boolean;
  segments: Segment[];
  totals: { freeMinutes: number; bookedMinutes: number; breakMinutes: number };
  /** Classes that fall on a day the tutor is away. They are shown, never deleted, so a person can decide. */
  affected: Array<{ startMinute: number; endMinute: number; subject: string; student: string | null }>;
}

export interface TutorCalendarView {
  tutor: { id: string; name: string; photoUrl: string | null; subjects: string[]; levels: string[]; active: boolean };
  from: string;
  to: string;
  /** Whether the person asking may see which student is behind a booked class. */
  canSeeStudents: boolean;
  days: CalendarDayView[];
}

const minutesOf = (d: Date) => d.getUTCHours() * 60 + d.getUTCMinutes();

/**
 * A tutor's real timetable for a range of dates: working time, breaks, leave, holidays and every booked class.
 * Read only. The student behind a class is shown only to people who may see that student; everyone else sees "Booked".
 */
@Injectable()
export class TutorCalendarService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rbac: RbacService,
  ) {}

  /** `showStudents` is for a tutor looking at their own calendar: the students behind their own classes are theirs to see. */
  async calendar(tutorProfileId: string, from: string, to: string, userId: string, options: { showStudents?: boolean } = {}): Promise<TutorCalendarView> {
    if (!isDateString(from) || !isDateString(to)) throw new BadRequestException('Choose real dates, written like 2026-11-09.');
    if (to < from) throw new BadRequestException('The end date cannot be before the start date.');
    if (daysBetween(from, to) + 1 > MAX_CALENDAR_DAYS) throw new BadRequestException(`Choose no more than ${MAX_CALENDAR_DAYS} days at a time.`);

    const db = this.prisma as unknown as PrismaTxClient;
    const profile = await db.tutorProfile.findUnique({ where: { id: tutorProfileId } });
    if (!profile) throw new NotFoundException('Tutor profile not found');
    const [employee, subjectLinks, gradeLinks, slots, perms] = await Promise.all([
      db.employee.findUnique({ where: { id: profile.employeeId } }),
      db.tutorSubject.findMany({ where: { tutorProfileId, isActive: true } }),
      db.tutorGrade.findMany({ where: { tutorProfileId, isActive: true } }),
      db.tutorAvailabilitySlot.findMany({ where: { tutorProfileId, isActive: true } }),
      this.rbac.getPermissionsForUser(userId),
    ]);
    const [subjects, grades] = await Promise.all([
      db.subject.findMany({ where: { id: { in: subjectLinks.map((l) => l.subjectId) } } }),
      db.grade.findMany({ where: { id: { in: gradeLinks.map((l) => l.gradeId) } } }),
    ]);
    const canSeeStudents = options.showStudents === true || perms.has('tutor.profile.manage') || perms.has('mentoring.student.read-all');
    const windows: AvailabilityWindow[] = slots.map((s) => ({ day: s.dayOfWeek as DayNumber, start: minutesToClock(minutesOf(s.startTime)), end: minutesToClock(minutesOf(s.endTime)) }));

    const calendars = await loadCalendars(db, [{ tutorProfileId, userId: employee?.userId ?? '', employeeId: profile.employeeId, windows }], {
      from,
      to,
      withStudentNames: canSeeStudents,
      timeZone: process.env.SYSTEM_TIMEZONE ?? 'Asia/Kolkata',
    });
    const input = calendars.get(tutorProfileId);
    if (!input) throw new NotFoundException('Tutor profile not found');

    return {
      tutor: {
        id: tutorProfileId,
        name: employee ? `${employee.firstName} ${employee.lastName}`.trim() : 'Tutor',
        photoUrl: profile.profilePhotoUrl ?? null,
        subjects: subjects.map((s) => s.name).sort(),
        levels: grades.map((g) => g.name),
        active: profile.tutorOperationalStatus === 'ACTIVE',
      },
      from,
      to,
      canSeeStudents,
      days: datesBetween(from, to).map((date) => {
        const day = resolveDay(input, date);
        return {
          date,
          label: describeDate(date),
          weekday: day.weekday,
          closed: day.closed ? { kind: day.closed.kind, note: day.closed.note } : null,
          configured: day.configured,
          segments: timeline(day),
          totals: dayTotals(day),
          affected: day.affected.map((c) => ({ startMinute: c.startMinute, endMinute: c.endMinute, subject: c.label.subject, student: c.label.student })),
        };
      }),
    };
  }
}

