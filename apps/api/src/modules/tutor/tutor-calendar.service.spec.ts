/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access */
import { BadRequestException, NotFoundException } from '@nestjs/common';

import { PERMISSIONS_KEY } from '../../common/rbac/require-permissions.decorator';
import { FakeDb } from '../mentoring/testing/mentoring-fake-db';

import { TutorCalendarService } from './tutor-calendar.service';
import { TutorProfileController } from './tutor-profile.controller';

const at = (hhmm: string) => new Date(`1970-01-01T${hhmm}:00Z`);
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const m = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const MON = 1, TUE = 2, WED = 3, THU = 4, SAT = 6;

const PERMS: Record<string, string[]> = {
  mentor: ['tutor.profile.read', 'mentoring.stage.work'],
  head: ['tutor.profile.read', 'mentoring.student.read-all'],
  hr: ['tutor.profile.read', 'tutor.profile.manage'],
};
const HOURS: Array<[number, string, string]> = [
  [MON, '14:00', '16:00'], [MON, '16:30', '20:00'], [TUE, '15:00', '17:00'], [TUE, '17:30', '20:00'], [WED, '14:00', '16:00'], [WED, '16:30', '19:00'],
  [THU, '15:00', '17:00'], [THU, '17:30', '20:00'], [SAT, '09:00', '11:00'], [SAT, '11:30', '14:00'],
];

function build() {
  const db = new FakeDb();
  db.seed('subject', { id: 'sub-sc', name: 'Science', isActive: true });
  db.seed('subject', { id: 'sub-bi', name: 'Biology', isActive: true });
  db.seed('grade', { id: 'g-8', name: 'Grade 8' });
  db.seed('employee', { id: 'e-meera', userId: 'u-meera', firstName: 'Meera', lastName: 'Thomas', employmentStatus: 'ACTIVE' });
  db.seed('tutorProfile', { id: 'tp-meera', employeeId: 'e-meera', tutorOperationalStatus: 'ACTIVE', profilePhotoUrl: null });
  db.seed('tutorSubject', { tutorProfileId: 'tp-meera', subjectId: 'sub-sc', isActive: true });
  db.seed('tutorSubject', { tutorProfileId: 'tp-meera', subjectId: 'sub-bi', isActive: true });
  db.seed('tutorGrade', { tutorProfileId: 'tp-meera', gradeId: 'g-8', isActive: true });
  for (const [d, a, b] of HOURS) db.seed('tutorAvailabilitySlot', { tutorProfileId: 'tp-meera', dayOfWeek: d, startTime: at(a), endTime: at(b), isActive: true });
  // The twelve synthetic bookings of the request, as real assignments with real students behind them.
  const book = (letter: string, subject: string, dayNumber: number, start: string, end: string, extra: Record<string, unknown> = {}) => {
    db.seed('lead', { id: `lead-${letter}` });
    db.seed('student', { id: `stu-${letter}`, firstName: 'Synthetic', lastName: `Student ${letter}` });
    db.seed('mentoringActivation', { id: `act-${letter}`, studentId: `stu-${letter}` });
    const a = db.seed('mentoringTutorAssignment', { id: `as-${letter}`, activationId: `act-${letter}`, subjectId: subject, tutorProfileId: 'tp-meera', status: 'ACTIVE', startDate: day('2026-11-09'), endDate: null });
    db.seed('mentoringTutorAssignmentSession', { assignmentId: a.id, tutorProfileId: 'tp-meera', dayOfWeek: dayNumber, frequency: 'WEEKLY', week: null, occurrences: [], startMinute: m(start), endMinute: m(end), ...extra });
  };
  book('A', 'sub-sc', MON, '14:00', '15:00'); book('B', 'sub-sc', MON, '15:00', '16:00'); book('C', 'sub-bi', MON, '16:30', '17:30'); book('D', 'sub-sc', MON, '18:30', '19:30');
  book('E', 'sub-bi', TUE, '15:00', '16:00'); book('F', 'sub-sc', TUE, '17:30', '18:30');
  book('G', 'sub-sc', WED, '15:00', '16:00'); book('H', 'sub-bi', WED, '17:30', '18:30');
  db.seed('employeeLeaveRequest', { employeeId: 'e-meera', status: 'APPROVED', startDate: '2026-11-12', endDate: '2026-11-12' });
  db.seed('tutorAvailabilityException', { tutorProfileId: 'tp-meera', date: day('2026-11-14'), kind: 'EXTRA_HOURS', startMinute: m('14:00'), endMinute: m('18:00'), note: 'Additional availability', isActive: true });
  db.seed('tutorAvailabilityException', { tutorProfileId: null, date: day('2026-11-25'), kind: 'HOLIDAY', startMinute: null, endMinute: null, note: 'Synthetic public holiday (test)', isActive: true });
  const rbac = { getPermissionsForUser: jest.fn((id: string) => Promise.resolve(new Set(PERMS[id] ?? []))) };
  return { db, service: new TutorCalendarService(db as any, rbac as any) };
}

/** A day as the screen draws it: "2:00 PM to 3:00 PM Science Synthetic Student A Occupied". */
const brief = (view: any, date: string) =>
  view.days.find((d: any) => d.date === date).segments.filter((s: any) => s.state !== 'NOT_WORKING').map((s: any) => `${s.start / 60}-${s.end / 60} ${s.state}${s.label ? ` ${s.label.subject} ${s.label.student ?? 'Booked'}` : ''}`);

describe('a tutor timetable for chosen dates', () => {
  it('Monday 9 November reproduces the timetable in the request, class by class', async () => {
    const { service } = build();
    const view = await service.calendar('tp-meera', '2026-11-09', '2026-11-11', 'hr');
    expect(brief(view, '2026-11-09')).toEqual([
      '14-15 CLASS Science Synthetic Student A', '15-16 CLASS Science Synthetic Student B', '16-16.5 BREAK', '16.5-17.5 CLASS Biology Synthetic Student C', '17.5-18.5 FREE', '18.5-19.5 CLASS Science Synthetic Student D', '19.5-20 FREE',
    ]);
  });

  it('Tuesday 10 and Wednesday 11 November match too, with the breaks and free time in the right places', async () => {
    const { service } = build();
    const view = await service.calendar('tp-meera', '2026-11-09', '2026-11-11', 'hr');
    expect(brief(view, '2026-11-10')).toEqual(['15-16 CLASS Biology Synthetic Student E', '16-17 FREE', '17-17.5 BREAK', '17.5-18.5 CLASS Science Synthetic Student F', '18.5-20 FREE']);
    expect(brief(view, '2026-11-11')).toEqual(['14-15 FREE', '15-16 CLASS Science Synthetic Student G', '16-16.5 BREAK', '16.5-17.5 FREE', '17.5-18.5 CLASS Biology Synthetic Student H', '18.5-19 FREE']);
  });

  it('shows leave, a holiday, extra hours on a normally short day, and a day off for the week', async () => {
    const { service } = build();
    const view = await service.calendar('tp-meera', '2026-11-12', '2026-11-16', 'hr');
    const leave = view.days[0];
    expect(leave.closed).toEqual({ kind: 'LEAVE', note: 'Approved leave' });
    expect(leave.segments).toEqual([{ start: 480, end: 1320, state: 'LEAVE', note: 'Approved leave' }]);
    const saturday = view.days.find((d: any) => d.date === '2026-11-14')!;
    expect(saturday.segments.filter((s: any) => s.state === 'FREE').map((s: any) => [s.start / 60, s.end / 60])).toEqual([[9, 11], [11.5, 18]]); // 9 to 2 normally, to 6 PM with the extra hours
    expect(view.days.find((d: any) => d.date === '2026-11-15')!.segments).toEqual([{ start: 480, end: 1320, state: 'NOT_WORKING' }]);
    const holiday = await service.calendar('tp-meera', '2026-11-25', '2026-11-25', 'hr');
    expect(holiday.days[0].closed).toEqual({ kind: 'HOLIDAY', note: 'Synthetic public holiday (test)' });
  });

  it('classes that fall on a day away are listed as affected, not deleted', async () => {
    const { service, db } = build();
    db.seed('mentoringTutorAssignmentSession', { assignmentId: 'as-E', tutorProfileId: 'tp-meera', dayOfWeek: THU, frequency: 'WEEKLY', week: null, occurrences: [], startMinute: m('15:00'), endMinute: m('16:00') });
    const view = await service.calendar('tp-meera', '2026-11-12', '2026-11-12', 'hr');
    expect(view.days[0].affected).toEqual([{ startMinute: m('15:00'), endMinute: m('16:00'), subject: 'Biology', student: 'Synthetic Student E' }]);
    expect(db.rows('mentoringTutorAssignmentSession').some((s) => s.assignmentId === 'as-E' && s.dayOfWeek === THU)).toBe(true);
  });

  it('totals: free, booked and break minutes for the day', async () => {
    const { service } = build();
    const view = await service.calendar('tp-meera', '2026-11-09', '2026-11-09', 'hr');
    expect(view.days[0].totals).toEqual({ freeMinutes: 90, bookedMinutes: 240, breakMinutes: 30 });
  });

  it('names the tutor with their subjects and levels', async () => {
    const { service } = build();
    expect((await service.calendar('tp-meera', '2026-11-09', '2026-11-09', 'hr')).tutor).toEqual({ id: 'tp-meera', name: 'Meera Thomas', photoUrl: null, subjects: ['Biology', 'Science'], levels: ['Grade 8'], active: true });
  });
});

describe('who sees which student', () => {
  it('HR staff and people who may see every student see the name behind a booked class', async () => {
    const { service } = build();
    for (const user of ['hr', 'head']) {
      const view = await service.calendar('tp-meera', '2026-11-09', '2026-11-09', user);
      expect(view.canSeeStudents).toBe(true);
      expect(JSON.stringify(view)).toContain('Synthetic Student A');
    }
  });

  it('a Mentor sees that a class is booked and which subject, never which student', async () => {
    const { service } = build();
    const view = await service.calendar('tp-meera', '2026-11-09', '2026-11-11', 'mentor');
    expect(view.canSeeStudents).toBe(false);
    const text = JSON.stringify(view);
    expect(text).not.toMatch(/Synthetic Student|stu-|act-|lead-/);
    expect(brief(view, '2026-11-09')[0]).toBe('14-15 CLASS Science Booked');
  });

  it('a person with no permissions sees no names either', async () => {
    const { service } = build();
    expect(JSON.stringify(await service.calendar('tp-meera', '2026-11-09', '2026-11-09', 'nobody'))).not.toMatch(/Synthetic Student/);
  });
});

describe('asking for a calendar', () => {
  it('refuses dates that are not real, a range that runs backwards, and a range over a month', async () => {
    const { service } = build();
    await expect(service.calendar('tp-meera', '2026-02-30', '2026-03-01', 'hr')).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.calendar('tp-meera', 'soon', '2026-03-01', 'hr')).rejects.toThrow('Choose real dates, written like 2026-11-09.');
    await expect(service.calendar('tp-meera', '2026-11-10', '2026-11-09', 'hr')).rejects.toThrow('The end date cannot be before the start date.');
    await expect(service.calendar('tp-meera', '2026-11-01', '2026-12-31', 'hr')).rejects.toThrow('Choose no more than 31 days at a time.');
    await expect(service.calendar('tp-meera', '2026-11-01', '2026-12-01', 'hr')).resolves.toBeTruthy(); // exactly 31 days
  });

  it('refuses a tutor that does not exist', async () => {
    const { service } = build();
    await expect(service.calendar('tp-nobody', '2026-11-09', '2026-11-09', 'hr')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('is read only: asking changes nothing', async () => {
    const { service, db } = build();
    // Querying makes the fake create empty tables lazily; only tables that hold rows count as data.
    const data = () => JSON.stringify(Object.entries(db.tables).filter(([, rows]) => rows.length > 0));
    const before = data();
    await service.calendar('tp-meera', '2026-11-09', '2026-11-30', 'hr');
    expect(data()).toBe(before);
  });

  it('the route needs the existing tutor profile read permission', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, (TutorProfileController.prototype as any).getCalendar)).toEqual(['tutor.profile.read']);
  });
});
