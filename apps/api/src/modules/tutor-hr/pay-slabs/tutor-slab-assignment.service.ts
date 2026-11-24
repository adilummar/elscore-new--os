import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { AuditService } from '../../../common/audit/audit.service';
import { PrismaService, PrismaTxClient } from '../../../common/prisma/prisma.service';

import { SLAB_SOURCE } from './pay-slab.constants';
import { SLAB_WITH_RATES, toPaySlabView } from './pay-slab.mapper';
import { AssignTutorSlabDto, CancelSlabChangeDto } from './tutor-slab.dto';

/** First day of a month as 'YYYY-MM-DD'. Months are DATE columns holding the 1st, read in Asia/Kolkata. */
export const monthText = (d: Date) => d.toISOString().slice(0, 10);
export const addMonths = (d: Date, n: number) =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));

type AssignmentRow = {
  id: string;
  slabId: string;
  fromMonth: Date;
  toMonth: Date | null;
  source: string;
  reason: string;
  createdAt: Date;
  cancelledAt: Date | null;
  cancelReason: string | null;
  slab: { name: string; currency: string };
  changedBy: { email: string };
  cancelledBy: { email: string } | null;
};

const ASSIGNMENT_SELECT = {
  id: true,
  slabId: true,
  fromMonth: true,
  toMonth: true,
  source: true,
  reason: true,
  createdAt: true,
  cancelledAt: true,
  cancelReason: true,
  slab: { select: { name: true, currency: true } },
  changedBy: { select: { email: true } },
  cancelledBy: { select: { email: true } },
} as const;

const CONFLICT_TEXT =
  "This slab change conflicts with the tutor's existing slab history. Reload and try again.";

/**
 * Which slab a tutor is on, month by month (Pay Slab step 3). Every rule below is also enforced by the database
 * (migration 20261124110000_tutor_slab_assignments); this service gives the friendly message first and
 * translates the database refusal if two people race.
 *
 *  - first slab:  starts in the current month (Asia/Kolkata), from the demo evaluation or from HR;
 *  - later slab:  HR Head / HR Staff, reason required, takes effect from NEXT month only;
 *  - a waiting change can be cancelled until its month starts; history is kept (cancelled rows stay).
 */
@Injectable()
export class TutorSlabAssignmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** The business month from the database clock (never the server or browser timezone). */
  async currentMonth(tx: Pick<PrismaTxClient, '$queryRaw'> = this.prisma): Promise<Date> {
    const [row] = await tx.$queryRaw<Array<{ m: Date }>>`SELECT tutor_slab_current_month() AS m`;
    return row.m;
  }

  /** Salary tab: the slab for this month, a change waiting for next month, and the full history. */
  async getSalary(tutorProfileId: string) {
    const tutor = await this.findTutor(this.prisma, tutorProfileId);
    const month = await this.currentMonth();
    const rows: AssignmentRow[] = await this.prisma.tutorSlabAssignment.findMany({
      where: { tutorProfileId },
      orderBy: [{ fromMonth: 'desc' }, { createdAt: 'desc' }],
      select: ASSIGNMENT_SELECT,
    });
    const live = rows.filter((r) => !r.cancelledAt);
    const current = live.find(
      (r) => r.fromMonth <= month && (r.toMonth === null || r.toMonth >= month),
    );
    const pending = live.find((r) => r.fromMonth > month);

    const slabIds = [...new Set([current?.slabId, pending?.slabId].filter(Boolean) as string[])];
    const slabs = slabIds.length
      ? await this.prisma.tutorSalarySlab.findMany({
          where: { id: { in: slabIds } },
          select: SLAB_WITH_RATES,
        })
      : [];
    const view = (id?: string) => {
      const s = slabs.find((x) => x.id === id);
      return s ? toPaySlabView(s) : null;
    };
    const toRow = (r: AssignmentRow) => ({
      id: r.id,
      slabId: r.slabId,
      slabName: r.slab.name,
      currency: r.slab.currency,
      fromMonth: monthText(r.fromMonth),
      toMonth: r.toMonth ? monthText(r.toMonth) : null, // null = Present
      source: r.source,
      reason: r.reason,
      changedBy: r.changedBy.email,
      createdAt: r.createdAt,
      cancelled: r.cancelledAt
        ? { at: r.cancelledAt, by: r.cancelledBy?.email ?? null, reason: r.cancelReason }
        : null,
      canCancel: !r.cancelledAt && r.source === SLAB_SOURCE.HR_CHANGE && r.fromMonth > month,
    });
    return {
      tutorProfileId,
      tutorCode: tutor.tutorCode,
      currentMonth: monthText(month),
      nextMonth: monthText(addMonths(month, 1)),
      current: current ? { ...toRow(current), slab: view(current.slabId) } : null,
      pending: pending ? { ...toRow(pending), slab: view(pending.slabId) } : null,
      history: rows.map(toRow),
    };
  }

  /** Tutors that are or were on a slab, for the slab detail screen. */
  async tutorsOnSlab(slabId: string) {
    const slab = await this.prisma.tutorSalarySlab.findUnique({
      where: { id: slabId },
      select: { id: true },
    });
    if (!slab) throw new NotFoundException('Salary slab not found');
    const month = await this.currentMonth();
    const rows = await this.prisma.tutorSlabAssignment.findMany({
      where: { slabId },
      orderBy: [{ fromMonth: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        fromMonth: true,
        toMonth: true,
        source: true,
        cancelledAt: true,
        tutorProfile: {
          select: {
            id: true,
            tutorCode: true,
            employee: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });
    return rows.map((r) => ({
      assignmentId: r.id,
      tutorProfileId: r.tutorProfile.id,
      tutorCode: r.tutorProfile.tutorCode,
      tutorName: `${r.tutorProfile.employee.firstName} ${r.tutorProfile.employee.lastName}`.trim(),
      fromMonth: monthText(r.fromMonth),
      toMonth: r.toMonth ? monthText(r.toMonth) : null,
      source: r.source,
      status: r.cancelledAt
        ? 'CANCELLED'
        : r.fromMonth > month
          ? 'SCHEDULED'
          : r.toMonth === null || r.toMonth >= month
            ? 'CURRENT'
            : 'PAST',
    }));
  }

  /** HR gives a tutor a slab. A tutor with none gets a first slab now; otherwise this is a change from next month. */
  async assign(tutorProfileId: string, dto: AssignTutorSlabDto, actorUserId: string) {
    const reason = dto.reason.trim();
    if (!reason) throw new BadRequestException('A reason is required');
    try {
      await this.prisma.$transaction(async (tx: PrismaTxClient) => {
        await this.lockTutor(tx, tutorProfileId);
        await this.findTutor(tx, tutorProfileId);
        const slab = await tx.tutorSalarySlab.findUnique({
          where: { id: dto.slabId },
          select: { id: true, name: true },
        });
        if (!slab) throw new BadRequestException('That salary slab does not exist');

        const month = await this.currentMonth(tx);
        const live = await tx.tutorSlabAssignment.findMany({
          where: { tutorProfileId, cancelledAt: null },
          orderBy: { fromMonth: 'desc' },
          select: { id: true, slabId: true, fromMonth: true, toMonth: true },
        });
        const latest = live[0];

        if (!latest) {
          const row = await tx.tutorSlabAssignment.create({
            data: {
              tutorProfileId,
              slabId: slab.id,
              fromMonth: month,
              source: SLAB_SOURCE.HR_INITIAL,
              changedByUserId: actorUserId,
              reason,
            },
            select: { id: true },
          });
          await this.audit.recordInTx(tx, {
            entityType: 'TutorSlabAssignment',
            entityId: row.id,
            action: 'TUTOR_SLAB_ASSIGNED',
            actorUserId,
            newValue: {
              tutorProfileId,
              slabId: slab.id,
              slabName: slab.name,
              fromMonth: monthText(month),
              reason,
            },
          });
          return;
        }

        if (latest.fromMonth > month) {
          throw new ConflictException(
            'A slab change is already waiting for next month. Cancel it first.',
          );
        }
        if (latest.slabId === slab.id) {
          throw new ConflictException('The tutor is already on this slab');
        }

        const next = addMonths(month, 1);
        // Close the current row at this month, then add next month's row (the database checks there is no gap).
        await tx.tutorSlabAssignment.update({ where: { id: latest.id }, data: { toMonth: month } });
        const row = await tx.tutorSlabAssignment.create({
          data: {
            tutorProfileId,
            slabId: slab.id,
            fromMonth: next,
            source: SLAB_SOURCE.HR_CHANGE,
            changedByUserId: actorUserId,
            reason,
          },
          select: { id: true },
        });
        await this.audit.recordInTx(tx, {
          entityType: 'TutorSlabAssignment',
          entityId: row.id,
          action: 'TUTOR_SLAB_CHANGE_SCHEDULED',
          actorUserId,
          oldValue: { slabId: latest.slabId },
          newValue: {
            tutorProfileId,
            slabId: slab.id,
            slabName: slab.name,
            fromMonth: monthText(next),
            reason,
          },
        });
      });
    } catch (e) {
      throw this.translate(e);
    }
    return this.getSalary(tutorProfileId);
  }

  /** Cancel a change that has not started. The row stays (marked cancelled); the previous slab is open again. */
  async cancel(
    tutorProfileId: string,
    assignmentId: string,
    dto: CancelSlabChangeDto,
    actorUserId: string,
  ) {
    const reason = dto.reason.trim();
    if (!reason) throw new BadRequestException('A reason is required');
    try {
      await this.prisma.$transaction(async (tx: PrismaTxClient) => {
        await this.lockTutor(tx, tutorProfileId);
        const row = await tx.tutorSlabAssignment.findFirst({
          where: { id: assignmentId, tutorProfileId },
          select: { id: true, slabId: true, fromMonth: true, source: true, cancelledAt: true },
        });
        if (!row) throw new NotFoundException('Slab assignment not found');
        if (row.cancelledAt) throw new ConflictException('This slab change is already cancelled');
        if (row.source !== SLAB_SOURCE.HR_CHANGE) {
          throw new ConflictException(
            'Only a later slab change can be cancelled, not the first slab',
          );
        }
        const month = await this.currentMonth(tx);
        if (row.fromMonth <= month) {
          throw new ConflictException(
            'This slab change has already started and can no longer be cancelled',
          );
        }
        await tx.tutorSlabAssignment.update({
          where: { id: row.id },
          data: { cancelledAt: new Date(), cancelledByUserId: actorUserId, cancelReason: reason },
        });
        // Give the old slab back: the live row that ended the month before this change was to start.
        const previous = await tx.tutorSlabAssignment.findFirst({
          where: { tutorProfileId, cancelledAt: null, toMonth: addMonths(row.fromMonth, -1) },
          select: { id: true },
        });
        if (previous) {
          await tx.tutorSlabAssignment.update({
            where: { id: previous.id },
            data: { toMonth: null },
          });
        }
        await this.audit.recordInTx(tx, {
          entityType: 'TutorSlabAssignment',
          entityId: row.id,
          action: 'TUTOR_SLAB_CHANGE_CANCELLED',
          actorUserId,
          oldValue: { slabId: row.slabId, fromMonth: monthText(row.fromMonth) },
          newValue: { tutorProfileId, reason },
        });
      });
    } catch (e) {
      throw this.translate(e);
    }
    return this.getSalary(tutorProfileId);
  }

  /**
   * First slab at Ready for Assignment: called inside that transaction, with the slab chosen at the demo
   * evaluation. Does nothing when the evaluation had no slab (the tutor then shows "no slab").
   */
  async assignFirstFromEvaluation(
    tx: PrismaTxClient,
    args: { tutorProfileId: string; tutorLeadId: string; actorUserId: string },
  ): Promise<{ assignmentId: string; slabId: string } | null> {
    const evaluation = await tx.tutorDemoEvaluation.findFirst({
      where: { tutorLeadId: args.tutorLeadId },
      orderBy: { evaluatedAt: 'desc' },
      select: { id: true, salarySlabId: true },
    });
    if (!evaluation?.salarySlabId) return null;
    const month = await this.currentMonth(tx);
    const row = await tx.tutorSlabAssignment.create({
      data: {
        tutorProfileId: args.tutorProfileId,
        slabId: evaluation.salarySlabId,
        fromMonth: month,
        source: SLAB_SOURCE.DEMO_EVALUATION,
        evaluationId: evaluation.id,
        changedByUserId: args.actorUserId,
        reason: 'Slab chosen at the demo evaluation',
      },
      select: { id: true },
    });
    await this.audit.recordInTx(tx, {
      entityType: 'TutorSlabAssignment',
      entityId: row.id,
      action: 'TUTOR_SLAB_ASSIGNED',
      actorUserId: args.actorUserId,
      newValue: {
        tutorProfileId: args.tutorProfileId,
        slabId: evaluation.salarySlabId,
        fromMonth: monthText(month),
        source: SLAB_SOURCE.DEMO_EVALUATION,
      },
    });
    return { assignmentId: row.id, slabId: evaluation.salarySlabId };
  }

  private async findTutor(db: Pick<PrismaTxClient, 'tutorProfile'>, id: string) {
    const t = await db.tutorProfile.findUnique({
      where: { id },
      select: { id: true, tutorCode: true },
    });
    // Older profiles without a Tutor ID stay hidden everywhere in Tutor Management.
    if (!t || !t.tutorCode) throw new NotFoundException('Tutor not found');
    return t;
  }

  /** One change at a time per tutor, so the checks above and the writes cannot interleave. */
  private async lockTutor(tx: PrismaTxClient, tutorProfileId: string) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'tutor-slab:' + tutorProfileId}))`;
  }

  /** Turn a database refusal (a race got past the checks above) into a plain 409; pass everything else through. */
  private translate(e: unknown): unknown {
    if (
      e instanceof BadRequestException ||
      e instanceof ConflictException ||
      e instanceof NotFoundException
    ) {
      return e;
    }
    const text = e instanceof Error ? e.message : '';
    const state = /code: "(\w{5})"/.exec(text)?.[1];
    if (state && ['23P01', '23514', '23001', '23505'].includes(state)) {
      const detail = /message: "([^"]+)"/.exec(text)?.[1];
      // Our own trigger messages are plain sentences; generic constraint messages are not shown to the user.
      return new ConflictException(
        detail && !/violates|conflicting key/.test(detail) ? detail : CONFLICT_TEXT,
      );
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return new ConflictException(CONFLICT_TEXT);
    }
    return e;
  }
}
