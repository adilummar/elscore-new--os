import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { AuditService } from '../../common/audit/audit.service';
import { PrismaService, PrismaTxClient } from '../../common/prisma/prisma.service';

import { AvailabilityWindow, DayNumber, clockToMinutes, minutesToClock, validateAvailability } from './tutor-availability';

const minutesOf = (d: Date) => d.getUTCHours() * 60 + d.getUTCMinutes();
const timeOf = (clock: string) => new Date(Date.UTC(1970, 0, 1, Math.floor(clockToMinutes(clock) / 60), clockToMinutes(clock) % 60));
const keyOf = (w: AvailabilityWindow) => `${w.day}|${w.start}|${w.end}`;

export interface TutorAvailabilityView {
  tutorProfileId: string;
  name: string;
  windows: AvailabilityWindow[];
}

/**
 * A tutor's weekly working hours. They are kept in the existing tutor_availability_slots table: one row is one time
 * range on one day, a day with no row is a day off, and two rows on one day leave a break. Removing a range
 * deactivates its row instead of deleting it, so the history stays. HR staff and the tutor themselves may change it;
 * the routes carry those permissions.
 *
 * Changing the hours never touches a booking. After a change is saved the Mentoring tutor assignments are checked
 * again (see MentoringTutorService), and any that no longer fit are flagged for review.
 */
@Injectable()
export class TutorAvailabilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
  ) {}

  private async profileWithName(db: PrismaTxClient, tutorProfileId: string) {
    const profile = await db.tutorProfile.findUnique({ where: { id: tutorProfileId } });
    if (!profile) throw new NotFoundException('Tutor profile not found');
    const employee = await db.employee.findUnique({ where: { id: profile.employeeId } });
    return { profile, name: employee ? `${employee.firstName} ${employee.lastName}`.trim() : 'Tutor' };
  }

  private async activeWindows(db: PrismaTxClient, tutorProfileId: string): Promise<AvailabilityWindow[]> {
    const rows = await db.tutorAvailabilitySlot.findMany({ where: { tutorProfileId, isActive: true } });
    return validateAvailabilityOrRaw(rows.map((r) => ({ day: r.dayOfWeek as DayNumber, start: minutesToClock(minutesOf(r.startTime)), end: minutesToClock(minutesOf(r.endTime)) })));
  }

  async get(tutorProfileId: string): Promise<TutorAvailabilityView> {
    const db = this.prisma as unknown as PrismaTxClient;
    const { name } = await this.profileWithName(db, tutorProfileId);
    return { tutorProfileId, name, windows: await this.activeWindows(db, tutorProfileId) };
  }

  async profileIdForUser(userId: string): Promise<string> {
    const employee = await this.prisma.employee.findUnique({ where: { userId } });
    if (!employee) throw new NotFoundException('Employee not found');
    const profile = await this.prisma.tutorProfile.findUnique({ where: { employeeId: employee.id } });
    if (!profile) throw new NotFoundException('Tutor profile not found');
    return profile.id;
  }

  /** Replaces the whole weekly availability. Invalid or overlapping ranges are refused and nothing is changed. */
  async replace(tutorProfileId: string, raw: unknown, actorUserId: string): Promise<TutorAvailabilityView & { changed: boolean }> {
    const checked = validateAvailability(raw);
    if (!checked.ok) throw new BadRequestException(checked.message);
    const next = checked.value;

    const changed = await this.prisma.$transaction(async (tx: PrismaTxClient) => {
      await tx.$executeRaw`SELECT 1 FROM tutor_profiles WHERE id = ${tutorProfileId} FOR UPDATE`;
      await this.profileWithName(tx, tutorProfileId);
      const current = await tx.tutorAvailabilitySlot.findMany({ where: { tutorProfileId, isActive: true } });
      const keyOfRow = (r: { dayOfWeek: number; startTime: Date; endTime: Date }) => keyOf({ day: r.dayOfWeek as DayNumber, start: minutesToClock(minutesOf(r.startTime)), end: minutesToClock(minutesOf(r.endTime)) });
      const wanted = new Set(next.map(keyOf));
      const have = new Set(current.map(keyOfRow));

      const remove = current.filter((r) => !wanted.has(keyOfRow(r)));
      const add = next.filter((w) => !have.has(keyOf(w)));
      if (remove.length === 0 && add.length === 0) return false;

      for (const row of remove) await tx.tutorAvailabilitySlot.update({ where: { id: row.id }, data: { isActive: false, deactivatedAt: new Date() } });
      if (add.length > 0) {
        await tx.tutorAvailabilitySlot.createMany({
          data: add.map((w) => ({ tutorProfileId, dayOfWeek: w.day, startTime: timeOf(w.start), endTime: timeOf(w.end), isActive: true, createdByUserId: actorUserId })),
        });
      }
      const before = validateAvailabilityOrRaw(current.map((r) => ({ day: r.dayOfWeek as DayNumber, start: minutesToClock(minutesOf(r.startTime)), end: minutesToClock(minutesOf(r.endTime)) })));
      await this.audit.recordInTx(tx, {
        entityType: 'TutorProfile',
        entityId: tutorProfileId,
        action: 'TUTOR_AVAILABILITY_UPDATED',
        actorUserId,
        oldValue: { windows: before },
        newValue: { windows: next },
        metadata: { added: add.length, removed: remove.length },
      });
      return true;
    });

    // After the change is saved, the students this tutor already teaches are checked again. A failure there must not
    // undo or hide the saved hours; it is logged by the listener.
    if (changed) this.events.emit('tutor.availability.changed', { tutorProfileId, actorUserId });
    const view = await this.get(tutorProfileId);
    return { ...view, changed };
  }
}

/** Sorted windows without throwing: rows already in the table are shown as they are. */
function validateAvailabilityOrRaw(windows: AvailabilityWindow[]): AvailabilityWindow[] {
  const result = validateAvailability(windows);
  return result.ok ? result.value : windows;
}

