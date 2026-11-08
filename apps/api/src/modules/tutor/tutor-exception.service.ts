import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { TutorExceptionKind } from '@prisma/client';

import { AuditService } from '../../common/audit/audit.service';
import { PrismaService, PrismaTxClient } from '../../common/prisma/prisma.service';

import { isDateString } from './tutor-calendar';

export interface ExceptionInput {
  date: string;
  kind: TutorExceptionKind;
  /** Minutes from midnight. Required for EXTRA_HOURS and BLOCKED, and refused for HOLIDAY and DAY_OFF. */
  startMinute?: number | null;
  endMinute?: number | null;
  note: string;
}

export interface ExceptionView {
  id: string;
  tutorProfileId: string | null;
  date: string;
  kind: TutorExceptionKind;
  startMinute: number | null;
  endMinute: number | null;
  note: string;
}

const WHOLE_DAY: TutorExceptionKind[] = ['HOLIDAY', 'DAY_OFF'];

/**
 * Dates that change a tutor's weekly pattern: a public holiday for everyone, a special day off, extra hours, or blocked
 * time for one tutor. Approved leave is not entered here; it comes from the leave module. Removing an exception
 * deactivates it and keeps the row. After every change the students this tutor teaches are checked again, and any class
 * that no longer fits is flagged for review (see MentoringTutorService); nothing is cancelled.
 */
@Injectable()
export class TutorExceptionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
  ) {}

  private check(tutorProfileId: string | null, input: ExceptionInput): void {
    if (!isDateString(input.date)) throw new BadRequestException('Choose a real date, written like 2026-11-09.');
    if (!input.note?.trim()) throw new BadRequestException('Add a note saying why.');
    if (input.note.length > 200) throw new BadRequestException('The note must be 200 characters or fewer.');
    if (input.kind === 'HOLIDAY' && tutorProfileId !== null) throw new BadRequestException('A public holiday applies to everyone, not one tutor.');
    if (input.kind !== 'HOLIDAY' && tutorProfileId === null) throw new BadRequestException('Choose a tutor for this kind of date.');
    const timed = !WHOLE_DAY.includes(input.kind);
    const { startMinute: a, endMinute: b } = input;
    if (!timed) {
      if ((a ?? null) !== null || (b ?? null) !== null) throw new BadRequestException('A whole day has no start or end time.');
      return;
    }
    if (typeof a !== 'number' || typeof b !== 'number' || !Number.isInteger(a) || !Number.isInteger(b)) throw new BadRequestException('Enter a start time and an end time.');
    if (a < 0 || b > 24 * 60 || b <= a) throw new BadRequestException('The end time must be after the start time, within the same day.');
    if (b - a < 15) throw new BadRequestException('A time range must be at least 15 minutes.');
  }

  private view(r: { id: string; tutorProfileId: string | null; date: Date; kind: TutorExceptionKind; startMinute: number | null; endMinute: number | null; note: string }): ExceptionView {
    return { id: r.id, tutorProfileId: r.tutorProfileId, date: r.date.toISOString().slice(0, 10), kind: r.kind, startMinute: r.startMinute, endMinute: r.endMinute, note: r.note };
  }

  /** Adds an exception. `tutorProfileId` is null for a public holiday. */
  async create(tutorProfileId: string | null, input: ExceptionInput, actorUserId: string): Promise<ExceptionView> {
    this.check(tutorProfileId, input);
    const created = await this.prisma.$transaction(async (tx: PrismaTxClient) => {
      if (tutorProfileId) {
        await tx.$executeRaw`SELECT 1 FROM tutor_profiles WHERE id = ${tutorProfileId} FOR UPDATE`;
        if (!(await tx.tutorProfile.findUnique({ where: { id: tutorProfileId } }))) throw new NotFoundException('Tutor profile not found');
      }
      const date = new Date(`${input.date}T00:00:00Z`);
      if (WHOLE_DAY.includes(input.kind)) {
        const same = await tx.tutorAvailabilityException.findFirst({ where: { tutorProfileId, date, kind: input.kind, isActive: true } });
        if (same) throw new ConflictException(input.kind === 'HOLIDAY' ? 'That date is already a public holiday.' : 'That date is already a day off for this tutor.');
      }
      const row = await tx.tutorAvailabilityException.create({
        data: { tutorProfileId, date, kind: input.kind, startMinute: input.startMinute ?? null, endMinute: input.endMinute ?? null, note: input.note.trim(), createdByUserId: actorUserId },
      });
      await this.audit.recordInTx(tx, {
        entityType: tutorProfileId ? 'TutorProfile' : 'TutorCalendar',
        entityId: tutorProfileId ?? 'organisation',
        action: 'TUTOR_EXCEPTION_ADDED',
        actorUserId,
        newValue: { ...this.view(row) },
      });
      return row;
    });
    this.announce(tutorProfileId, actorUserId);
    return this.view(created);
  }

  /** Removes an exception by deactivating it. The row stays for the record. */
  async deactivate(exceptionId: string, actorUserId: string): Promise<{ removed: boolean }> {
    const row = await this.prisma.tutorAvailabilityException.findUnique({ where: { id: exceptionId } });
    if (!row) throw new NotFoundException('Exception not found');
    if (!row.isActive) return { removed: false };
    await this.prisma.$transaction(async (tx: PrismaTxClient) => {
      await tx.tutorAvailabilityException.update({ where: { id: exceptionId }, data: { isActive: false, deactivatedAt: new Date() } });
      await this.audit.recordInTx(tx, {
        entityType: row.tutorProfileId ? 'TutorProfile' : 'TutorCalendar',
        entityId: row.tutorProfileId ?? 'organisation',
        action: 'TUTOR_EXCEPTION_REMOVED',
        actorUserId,
        oldValue: { ...this.view(row) },
      });
    });
    this.announce(row.tutorProfileId, actorUserId);
    return { removed: true };
  }

  async list(tutorProfileId: string | null, from: string, to: string): Promise<ExceptionView[]> {
    if (!isDateString(from) || !isDateString(to)) throw new BadRequestException('Choose real dates, written like 2026-11-09.');
    const rows = await this.prisma.tutorAvailabilityException.findMany({
      where: { tutorProfileId, isActive: true, date: { gte: new Date(`${from}T00:00:00Z`), lte: new Date(`${to}T00:00:00Z`) } },
      orderBy: { date: 'asc' },
    });
    return rows.map((r) => this.view(r));
  }

  /** A holiday touches every tutor; a tutor's exception touches that tutor's students. */
  private announce(tutorProfileId: string | null, actorUserId: string) {
    this.events.emit('tutor.availability.changed', { tutorProfileId, actorUserId });
  }
}
