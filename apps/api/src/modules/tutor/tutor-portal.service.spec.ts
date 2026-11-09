/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access */
import { readFileSync } from 'fs';
import { join } from 'path';

import { BadRequestException, NotFoundException } from '@nestjs/common';

import { PERMISSIONS_KEY } from '../../common/rbac/require-permissions.decorator';
import { FakeDb } from '../mentoring/testing/mentoring-fake-db';

import { TutorCalendarService } from './tutor-calendar.service';
import { TutorPortalController } from './tutor-portal.controller';
import { TutorPortalService } from './tutor-portal.service';

const at = (hhmm: string) => new Date(`1970-01-01T${hhmm}:00Z`);
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const m = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

function world() {
  const db = new FakeDb();
  db.seed('subject', { id: 'sub-en', name: 'English', isActive: true });
  db.seed('subject', { id: 'sub-ma', name: 'Mathematics', isActive: true });
  db.seed('grade', { id: 'g-8', name: 'Grade 8' });
  for (const [key, first, last, subject] of [['meera', 'Meera', 'Thomas', 'sub-en'], ['rahul', 'Rahul', 'Nair', 'sub-ma']] as const) {
    db.seed('employee', { id: `e-${key}`, userId: `u-${key}`, firstName: first, lastName: last, employmentStatus: 'ACTIVE' });
    db.seed('tutorProfile', { id: `tp-${key}`, employeeId: `e-${key}`, tutorOperationalStatus: 'ACTIVE', profilePhotoUrl: null });
    db.seed('tutorSubject', { tutorProfileId: `tp-${key}`, subjectId: subject });
    db.seed('tutorGrade', { tutorProfileId: `tp-${key}`, gradeId: 'g-8' });
    db.seed('tutorAvailabilitySlot', { tutorProfileId: `tp-${key}`, dayOfWeek: 1, startTime: at('14:00'), endTime: at('20:00') });
    const letter = key === 'meera' ? 'A' : 'B';
    db.seed('lead', { id: `lead-${letter}` });
    db.seed('student', { id: `stu-${letter}`, firstName: 'Synthetic', lastName: `Student ${letter}` });
    db.seed('mentoringActivation', { id: `act-${letter}`, studentId: `stu-${letter}` });
    const a = db.seed('mentoringTutorAssignment', { id: `as-${letter}`, activationId: `act-${letter}`, subjectId: subject, tutorProfileId: `tp-${key}`, status: 'ACTIVE', startDate: day('2026-11-09'), endDate: null });
    db.seed('mentoringTutorAssignmentSession', { assignmentId: a.id, tutorProfileId: `tp-${key}`, dayOfWeek: 1, frequency: 'WEEKLY', week: null, occurrences: [], startMinute: m(key === 'meera' ? '15:00' : '16:00'), endMinute: m(key === 'meera' ? '16:00' : '17:00') });
  }
  db.seed('employee', { id: 'e-mentor', userId: 'u-mentor', firstName: 'Mira', lastName: 'Mentor', employmentStatus: 'ACTIVE' }); // an employee with no tutor profile
  const rbac = { getPermissionsForUser: jest.fn(() => Promise.resolve(new Set(['tutor.portal.read']))) };
  const service = new TutorPortalService(db as any, new TutorCalendarService(db as any, rbac as any));
  return { db, service };
}

describe('the tutor portal shows a tutor their own work', () => {
  it("finds the signed-in tutor's own profile", async () => {
    const w = world();
    await expect(w.service.mine('u-meera')).resolves.toEqual({ tutorProfileId: 'tp-meera', name: 'Meera Thomas', active: true });
  });

  it("lists the tutor's own classes with the students behind them", async () => {
    const w = world();
    const view = await w.service.calendar('u-meera', '2026-11-09', '2026-11-09');
    const classes = view.days[0].segments.filter((s) => s.state === 'CLASS');
    expect(classes.map((s) => [s.start / 60, s.end / 60, s.label?.subject, s.label?.student])).toEqual([[15, 16, 'English', 'Synthetic Student A']]);
    expect(view.canSeeStudents).toBe(true);
  });

  it("never carries another tutor's classes, students or booking details", async () => {
    const w = world();
    const view = await w.service.calendar('u-meera', '2026-11-09', '2026-11-15');
    const text = JSON.stringify(view);
    expect(text).not.toContain('Student B');
    expect(text).not.toContain('Mathematics');
    expect(text).not.toContain('tp-rahul');
    const rahul = await w.service.calendar('u-rahul', '2026-11-09', '2026-11-09');
    expect(JSON.stringify(rahul)).toContain('Synthetic Student B');
    expect(JSON.stringify(rahul)).not.toContain('Student A');
  });

  it('refuses someone who is not a tutor, and a request for too long a range', async () => {
    const w = world();
    await expect(w.service.mine('u-mentor')).rejects.toBeInstanceOf(NotFoundException);
    await expect(w.service.calendar('u-mentor', '2026-11-09', '2026-11-09')).rejects.toThrow('You do not have a tutor profile.');
    await expect(w.service.calendar('nobody', '2026-11-09', '2026-11-09')).rejects.toBeInstanceOf(NotFoundException);
    await expect(w.service.calendar('u-meera', '2026-11-09', '2027-03-01')).rejects.toBeInstanceOf(BadRequestException);
    await expect(w.service.calendar('u-meera', 'soon', '2026-11-09')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('reads only: nothing is written', async () => {
    const w = world();
    const snap = () => JSON.stringify(Object.fromEntries(Object.entries(w.db.tables).filter(([, r]) => r.length)));
    const before = snap();
    await w.service.calendar('u-meera', '2026-11-09', '2026-11-15');
    expect(snap()).toBe(before);
  });
});

describe('the tutor portal routes', () => {
  const proto = TutorPortalController.prototype as any;

  it('need the tutor portal permission', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, proto.me)).toEqual(['tutor.portal.read']);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, proto.calendar)).toEqual(['tutor.portal.read']);
  });

  it('never take a tutor id, so no request can name another tutor', () => {
    const source = readFileSync(join(__dirname, 'tutor-portal.controller.ts'), 'utf8');
    expect(source).not.toMatch(/@Param\(/);
    expect(source).not.toMatch(/tutorProfileId|tutorId/);
    expect(source.match(/@Query\('/g)?.length).toBe(2); // from and to, nothing else
  });
});
