import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService, PrismaTxClient } from '../../common/prisma/prisma.service';
import { isDateString } from '../tutor/tutor-calendar';

import { MentoringAccessService, MentoringScope } from './mentoring-access.service';
import {
  DEFAULT_POLICIES, SLA_LABELS, SlaMode, SlaPolicyRules, SlaState, SlaView, WorkingPolicy, addMinutes, slaView, workingFrom,
} from './mentoring-sla';

export interface StartSlaInput {
  policyKey: string;
  entityType: string;
  entityId: string;
  activationId?: string | null;
  /** Who must act. Defaults to the student's assigned Mentor. */
  responsibleUserId?: string | null;
  /** When the clock starts. Defaults to now. */
  startedAt?: Date;
}

export interface SlaFilters {
  policyKey?: string;
  state?: string;
  /** OPEN (default) shows work still to do; ALL also shows finished work. */
  status?: string;
  activationId?: string;
  responsibleUserId?: string;
  from?: string;
  to?: string;
  limit?: number | string;
}

export interface SlaRow {
  id: string;
  policyKey: string;
  policyLabel: string;
  entityType: string;
  entityId: string;
  activationId: string | null;
  responsibleUserId: string | null;
  responsibleName: string | null;
  startedAt: string;
  dueAt: string;
  firstResponseAt: string | null;
  completedAt: string | null;
  status: 'OPEN' | 'COMPLETED' | 'CANCELLED';
  state: SlaState;
  stateLabel: string;
  metSla: boolean | null;
  overdueMinutes: number;
  remainingMinutes: number;
}

export interface SlaList {
  rows: SlaRow[];
  counts: Record<SlaState, number>;
  workingHours: { start: string; end: string; timeZone: string; offDays: number[] };
}

const MAX_LIMIT = 200;
const STATES: readonly string[] = ['WITHIN_SLA', 'APPROACHING', 'BREACHED', 'RESOLVED'];
const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Two-working-hour response targets for Mentoring work. An item's due time is fixed when its clock starts, from the policy
 * and the working schedule in force then. Starting, responding and completing take the caller's transaction, so a target
 * is never started or stopped without the work that caused it.
 */
@Injectable()
export class MentoringSlaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: MentoringAccessService,
  ) {}

  /** The policy for a kind of work: its saved row if it has one and is active, else the built-in default, else none. */
  async policyFor(db: PrismaTxClient, key: string): Promise<SlaPolicyRules> {
    const row = await db.mentoringSlaPolicy.findUnique({ where: { key } });
    if (row && row.isActive) return { key, label: row.label, targetMinutes: row.targetMinutes, mode: row.mode as SlaMode, measure: row.measure as SlaPolicyRules['measure'], approachingPercent: row.approachingPercent };
    if (!row && DEFAULT_POLICIES[key]) return DEFAULT_POLICIES[key];
    throw new BadRequestException(`There is no active response-time target for "${key}".`);
  }

  /** The organisation's working schedule now in force, or the default one. */
  async workingNow(db: PrismaTxClient, now: Date = new Date()): Promise<WorkingPolicy> {
    const schedules = await db.globalWorkingSchedule.findMany({ where: { effectiveFrom: { lte: now } }, orderBy: { effectiveFrom: 'desc' }, take: 1 });
    return workingFrom(schedules[0]);
  }

  /** Starts a clock. Starting the same work again returns the clock already running. */
  async start(db: PrismaTxClient, input: StartSlaInput) {
    const key = `${input.policyKey}:${input.entityType}:${input.entityId}`;
    const open = await db.mentoringSlaItem.findFirst({ where: { currentKey: key } });
    if (open) return open;
    const policy = await this.policyFor(db, input.policyKey);
    const working = await this.workingNow(db, input.startedAt);
    const startedAt = input.startedAt ?? new Date();
    let responsible = input.responsibleUserId ?? null;
    if (!responsible && input.activationId) responsible = (await db.mentoringActivation.findUnique({ where: { id: input.activationId } }))?.currentMentorUserId ?? null;
    return db.mentoringSlaItem.create({
      data: {
        policyKey: input.policyKey, entityType: input.entityType, entityId: input.entityId, activationId: input.activationId ?? null, responsibleUserId: responsible, currentKey: key,
        status: 'OPEN', startedAt, dueAt: addMinutes(startedAt, policy.targetMinutes, policy.mode, working), targetMinutes: policy.targetMinutes,
      },
    });
  }

  private async openItem(db: PrismaTxClient, policyKey: string, entityType: string, entityId: string) {
    return db.mentoringSlaItem.findFirst({ where: { currentKey: `${policyKey}:${entityType}:${entityId}` } });
  }

  /** Records the first response. Later responses change nothing. */
  async respond(db: PrismaTxClient, policyKey: string, entityType: string, entityId: string, at: Date = new Date()) {
    const item = await this.openItem(db, policyKey, entityType, entityId);
    if (!item || item.firstResponseAt) return item;
    return db.mentoringSlaItem.update({ where: { id: item.id }, data: { firstResponseAt: at } });
  }

  /** Stops the clock because the work is finished. A response is implied if none was recorded. */
  async complete(db: PrismaTxClient, policyKey: string, entityType: string, entityId: string, at: Date = new Date()) {
    const item = await this.openItem(db, policyKey, entityType, entityId);
    if (!item) return null;
    return db.mentoringSlaItem.update({ where: { id: item.id }, data: { status: 'COMPLETED', currentKey: null, completedAt: at, firstResponseAt: item.firstResponseAt ?? at } });
  }

  /** Stops the clock because the work no longer needs doing (the class was cancelled, say). */
  async cancel(db: PrismaTxClient, policyKey: string, entityType: string, entityId: string, at: Date = new Date()) {
    const item = await this.openItem(db, policyKey, entityType, entityId);
    if (!item) return null;
    return db.mentoringSlaItem.update({ where: { id: item.id }, data: { status: 'CANCELLED', currentKey: null, completedAt: at } });
  }

  // ─── Reading, filtered on the server ───────────────────────────────────────────────────────────────────────────
  async list(scope: MentoringScope, filters: SlaFilters = {}, now: Date = new Date()): Promise<SlaList> {
    this.access.requireAnyScope(scope);
    const db = this.prisma as unknown as PrismaTxClient;
    if (filters.state !== undefined && !STATES.includes(filters.state)) throw new BadRequestException('Choose within SLA, approaching, breached or resolved.');
    if (filters.status !== undefined && !['OPEN', 'ALL'].includes(filters.status)) throw new BadRequestException('Choose open or all.');
    for (const d of [filters.from, filters.to]) if (d !== undefined && !isDateString(d)) throw new BadRequestException('Choose real dates, written like 2026-11-09.');
    const limit = Math.min(MAX_LIMIT, Math.max(1, Number(filters.limit ?? 100) || 100));

    // Students the caller may see. Everyone else's work is not in the result, whatever the filters say.
    const where: Record<string, unknown> = {};
    if (filters.activationId) {
      const visible = await db.mentoringActivation.findFirst({ where: { AND: [{ id: filters.activationId }, this.access.visibilityWhere(scope)] } });
      if (!visible) throw new NotFoundException('Student not found');
      where.activationId = filters.activationId;
    } else if (!scope.all) {
      const mine = await db.mentoringActivation.findMany({ where: this.access.visibilityWhere(scope) });
      where.activationId = { in: mine.map((a) => a.id) };
    }
    if (filters.policyKey) where.policyKey = filters.policyKey;
    if (filters.responsibleUserId) where.responsibleUserId = filters.responsibleUserId;
    if ((filters.status ?? 'OPEN') === 'OPEN') where.status = 'OPEN';
    if (filters.from || filters.to) where.startedAt = { ...(filters.from ? { gte: new Date(`${filters.from}T00:00:00Z`) } : {}), ...(filters.to ? { lte: new Date(`${filters.to}T23:59:59Z`) } : {}) };

    const [items, policies, working] = await Promise.all([db.mentoringSlaItem.findMany({ where, orderBy: { dueAt: 'asc' } }), db.mentoringSlaPolicy.findMany({}), this.workingNow(db, now)]);
    const rules = (key: string): SlaPolicyRules => {
      const row = policies.find((p) => p.key === key);
      if (row) return { key, label: row.label, targetMinutes: row.targetMinutes, mode: row.mode as SlaMode, measure: row.measure as SlaPolicyRules['measure'], approachingPercent: row.approachingPercent };
      return DEFAULT_POLICIES[key] ?? { key, label: key, targetMinutes: 120, mode: 'WORKING_HOURS', measure: 'COMPLETION', approachingPercent: 75 };
    };
    const people = await db.employee.findMany({ where: { userId: { in: [...new Set(items.map((i) => i.responsibleUserId).filter((u): u is string => !!u))] } } });

    const all = items.map((i) => {
      const policy = rules(i.policyKey);
      const view: SlaView = slaView({ status: i.status, startedAt: i.startedAt, dueAt: i.dueAt, firstResponseAt: i.firstResponseAt, completedAt: i.completedAt }, policy, working, now);
      const person = people.find((p) => p.userId === i.responsibleUserId);
      const row: SlaRow = {
        id: i.id, policyKey: i.policyKey, policyLabel: policy.label, entityType: i.entityType, entityId: i.entityId, activationId: i.activationId, responsibleUserId: i.responsibleUserId,
        responsibleName: person ? `${person.firstName} ${person.lastName}`.trim() : null, startedAt: i.startedAt.toISOString(), dueAt: i.dueAt.toISOString(),
        firstResponseAt: i.firstResponseAt?.toISOString() ?? null, completedAt: i.completedAt?.toISOString() ?? null, status: i.status, state: view.state, stateLabel: view.label,
        metSla: view.metSla, overdueMinutes: view.overdueMinutes, remainingMinutes: view.remainingMinutes,
      };
      return row;
    });
    const counts: Record<SlaState, number> = { WITHIN_SLA: 0, APPROACHING: 0, BREACHED: 0, RESOLVED: 0 };
    for (const r of all) counts[r.state] += 1;
    const rows = (filters.state ? all.filter((r) => r.state === filters.state) : all).slice(0, limit);
    return { rows, counts, workingHours: { start: `${pad(Math.floor(working.start / 60))}:${pad(working.start % 60)}`, end: `${pad(Math.floor(working.end / 60))}:${pad(working.end % 60)}`, timeZone: working.timeZone, offDays: [...working.offDays] } };
  }
}

export { SLA_LABELS };
