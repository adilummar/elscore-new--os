import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService, PrismaTxClient } from '../../common/prisma/prisma.service';

import { MentoringAccessService, MentoringScope } from './mentoring-access.service';

const MAX_LABEL = 60;

/** The label with single spaces and in lower case: two labels with the same key are the same option. */
export const labelKeyOf = (label: string) => label.trim().replace(/\s+/g, ' ').toLowerCase();
/** A code made from a label: capitals, digits and underscores. */
export const codeOf = (label: string) => label.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);

export interface ActivityOptionView { id: string; code: string; label: string; isActive: boolean; sortOrder: number }

/**
 * The activities a Mentor can record as given in a class, kept in Settings by the Mentoring Head. An option is never deleted: switching it off
 * hides it from new choices. A submission stores the code and the label it was made with, so renaming or switching off an option never changes
 * what an earlier class says.
 */
@Injectable()
export class MentoringActivityOptionService {
  constructor(private readonly prisma: PrismaService, private readonly access: MentoringAccessService) {}

  private get db() {
    return this.prisma as unknown as PrismaTxClient;
  }

  private view(o: { id: string; code: string; label: string; isActive: boolean; sortOrder: number }): ActivityOptionView {
    return { id: o.id, code: o.code, label: o.label, isActive: o.isActive, sortOrder: o.sortOrder };
  }

  /** Anyone who can see Mentoring students sees the active options. Only a manager sees the switched-off ones too. */
  async list(scope: MentoringScope, includeInactive: boolean): Promise<ActivityOptionView[]> {
    const manager = scope.perms.has('mentoring.template.manage');
    if (!manager) this.access.requireAnyScope(scope);
    const all = includeInactive && manager;
    const rows = await this.db.mentoringActivityOption.findMany({ where: all ? {} : { isActive: true } });
    return rows.sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label)).map((o) => this.view(o));
  }

  private checkLabel(raw: unknown): string {
    if (typeof raw !== 'string') throw new BadRequestException('Write the name of the activity.');
    const label = raw.trim().replace(/\s+/g, ' ');
    if (!label) throw new BadRequestException('Write the name of the activity.');
    if (label.length > MAX_LABEL) throw new BadRequestException(`The name must be ${MAX_LABEL} characters or fewer.`);
    return label;
  }

  async create(userId: string, body: unknown): Promise<ActivityOptionView> {
    const r = body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
    const label = this.checkLabel(r.label);
    const key = labelKeyOf(label);
    const base = codeOf(label);
    if (!base) throw new BadRequestException('The name must contain letters or numbers.');
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const rows = await tx.mentoringActivityOption.findMany({ where: {} });
      if (rows.some((o) => o.labelKey === key)) throw new ConflictException('That activity is already on the list.');
      let code = base;
      for (let n = 2; rows.some((o) => o.code === code); n += 1) code = `${base}_${n}`;
      const sortOrder = rows.reduce((m, o) => Math.max(m, o.sortOrder), 0) + 10;
      return this.view(await tx.mentoringActivityOption.create({ data: { code, label, labelKey: key, isActive: true, sortOrder, createdByUserId: userId } }));
    });
  }

  /** Renames, switches on or off, or reorders one option. The code never changes. */
  async update(userId: string, id: string, body: unknown): Promise<ActivityOptionView> {
    void userId;
    const r = body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const rows = await tx.mentoringActivityOption.findMany({ where: {} });
      const current = rows.find((o) => o.id === id);
      if (!current) throw new NotFoundException('Activity not found');
      const data: { label?: string; labelKey?: string; isActive?: boolean; sortOrder?: number } = {};
      if (r.label !== undefined) {
        const label = this.checkLabel(r.label);
        const key = labelKeyOf(label);
        if (rows.some((o) => o.id !== id && o.labelKey === key)) throw new ConflictException('That activity is already on the list.');
        if (label !== current.label) Object.assign(data, { label, labelKey: key });
      }
      if (r.isActive !== undefined) {
        if (typeof r.isActive !== 'boolean') throw new BadRequestException('Say whether the activity is switched on.');
        if (r.isActive !== current.isActive) data.isActive = r.isActive;
      }
      if (r.sortOrder !== undefined) {
        if (typeof r.sortOrder !== 'number' || !Number.isInteger(r.sortOrder) || r.sortOrder < 0 || r.sortOrder > 10000) throw new BadRequestException('The order must be a whole number from 0 to 10000.');
        if (r.sortOrder !== current.sortOrder) data.sortOrder = r.sortOrder;
      }
      if (Object.keys(data).length === 0) return this.view(current);
      return this.view(await tx.mentoringActivityOption.update({ where: { id }, data }));
    });
  }
}
