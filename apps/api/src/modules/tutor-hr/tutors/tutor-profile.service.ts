import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { fromZonedTime, toZonedTime } from 'date-fns-tz';

import { AuditService } from '../../../common/audit/audit.service';
import { PrismaService, PrismaTxClient } from '../../../common/prisma/prisma.service';
import { RbacService } from '../../../common/rbac/rbac.service';
import { InvalidPhoneError, normalizePhone } from '../hiring/phone.util';

import {
  AddressDto, ChangeTutorStatusDto, EmergencyContactDto, HrNoteDto, ListTutorsQueryDto, QualificationDto, SummaryQueryDto, UpdateTutorProfileDto,
} from './tutor-profile.dto';
import {
  ADDRESS_FIELDS, AddressRecord, assertPrimaryDiffers, assertStatusChange, copyPermanentToCurrent, EMERGENCY_CONTACT_ALERT, maskAccountNumber,
  profileGaps, TutorProfileRuleError, TutorStatus,
} from './tutor-profile-rules';

export const PROFILE_MANAGE = 'tutor_hr.profile.manage';
export const NOTES_MANAGE = 'tutor_hr.notes.manage';

const userSelect = { select: { id: true, email: true } } as const;
const DETAIL_KEYS = [
  'gender', 'maritalStatus', 'currentSameAsPermanent',
  ...ADDRESS_FIELDS.map((f) => `perm${f}`), ...ADDRESS_FIELDS.map((f) => `cur${f}`),
  'bankAccountHolder', 'bankName', 'bankBranch', 'bankAccountNumber', 'bankIfsc',
] as const;

type Details = Record<string, unknown>;

/** undefined = leave unchanged; null or blank = clear; otherwise the trimmed value. */
const clean = (v?: string | null): string | null | undefined => (v === undefined ? undefined : (v ?? '').trim() || null);

/**
 * HR side of Tutor Management > Tutors: profile, qualifications, statuses, HR internal notes and
 * the HR-only history. Only profiles with a Tutor ID (created through Ready for Assignment) are shown.
 */
@Injectable()
export class TutorProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly rbac: RbacService,
    private readonly config: ConfigService,
  ) {}

  // ── Helpers ───────────────────────────────────────────────────────────────

  private rule<T>(fn: () => T): T {
    try {
      return fn();
    } catch (e) {
      if (e instanceof TutorProfileRuleError || e instanceof InvalidPhoneError) throw new BadRequestException(e.message);
      throw e;
    }
  }

  private tz() {
    return this.config.get<string>('crm.businessTimezone') ?? 'Asia/Kolkata';
  }

  private async load(id: string) {
    const p = await this.prisma.tutorProfile.findFirst({
      where: { id, tutorCode: { not: null } },
      include: { employee: { select: { id: true, firstName: true, lastName: true, phone: true, user: { select: { email: true } } } } },
    });
    if (!p) throw new NotFoundException('Tutor not found');
    return p;
  }

  private contactPhone(c: EmergencyContactDto) {
    const n = this.rule(() => normalizePhone(c.phone, c.countryCode));
    return `+${n.normalized}`;
  }

  private addressData(prefix: 'perm' | 'cur', a: AddressDto): Details {
    const t = clean;
    return {
      [`${prefix}House`]: t(a.house), [`${prefix}Village`]: t(a.village), [`${prefix}District`]: t(a.district),
      [`${prefix}Pin`]: t(a.pin), [`${prefix}State`]: t(a.state), [`${prefix}Country`]: t(a.country),
    };
  }

  /** Audit-safe view of personal details: never the full account number. */
  private safe(d: Details): Details {
    return 'bankAccountNumber' in d ? { ...d, bankAccountNumber: maskAccountNumber(d.bankAccountNumber as string | null) } : d;
  }

  // ── Tutors list and dashboard ─────────────────────────────────────────────

  /** Status cards are current counts; New counts tutors verified in the period (default: this month). */
  async summary(q: SummaryQueryDto) {
    const tz = this.tz();
    const now = toZonedTime(new Date(), tz);
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const nextMonth = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 1)).toISOString().slice(0, 10);
    const fromDay = q.from?.slice(0, 10) ?? monthStart;
    const toExclusive = q.to
      ? new Date(Date.UTC(+q.to.slice(0, 4), +q.to.slice(5, 7) - 1, +q.to.slice(8, 10) + 1)).toISOString().slice(0, 10)
      : nextMonth;
    const start = fromZonedTime(`${fromDay}T00:00:00`, tz);
    const end = fromZonedTime(`${toExclusive}T00:00:00`, tz);
    if (end <= start) throw new BadRequestException('"to" must not be before "from"');

    const base: Prisma.TutorProfileWhereInput = { tutorCode: { not: null } };
    const count = (w: Prisma.TutorProfileWhereInput) => this.prisma.tutorProfile.count({ where: { ...base, ...w } });
    const [total, active, inactive, suspended, newTutors] = await Promise.all([
      count({}), count({ tutorOperationalStatus: 'ACTIVE' }), count({ tutorOperationalStatus: 'INACTIVE' }),
      count({ tutorOperationalStatus: 'SUSPENDED' }), count({ verifiedAt: { gte: start, lt: end } }),
    ]);
    return { period: { from: fromDay, to: q.to?.slice(0, 10) ?? null, start, end }, total, active, newTutors, inactive, suspended };
  }

  async list(q: ListTutorsQueryDto) {
    const s = q.search?.trim();
    const and: Prisma.TutorProfileWhereInput[] = [{ tutorCode: { not: null } }];
    if (s) {
      and.push({
        OR: [
          { tutorCode: { contains: s, mode: 'insensitive' } },
          { employee: { firstName: { contains: s, mode: 'insensitive' } } },
          { employee: { lastName: { contains: s, mode: 'insensitive' } } },
          { employee: { phone: { contains: s.replace(/\s/g, '') } } },
          { employee: { user: { email: { contains: s, mode: 'insensitive' } } } },
        ],
      });
    }
    if (q.status) and.push({ tutorOperationalStatus: q.status as TutorStatus });
    if (q.subjectId) and.push({ subjects: { some: { subjectId: q.subjectId, isActive: true } } });
    if (q.gradeId) and.push({ grades: { some: { gradeId: q.gradeId, isActive: true } } });
    if (q.minEnglishRating) and.push({ tutorLead: { is: { demoEvaluations: { some: { englishRating: { gte: q.minEnglishRating } } } } } });
    if (q.from || q.to) {
      const tz = this.tz();
      and.push({
        verifiedAt: {
          ...(q.from ? { gte: fromZonedTime(`${q.from.slice(0, 10)}T00:00:00`, tz) } : {}),
          ...(q.to ? { lte: fromZonedTime(`${q.to.slice(0, 10)}T23:59:59.999`, tz) } : {}),
        },
      });
    }
    const dir = q.sortDir ?? (q.sortBy === 'name' || q.sortBy === 'tutorCode' ? 'asc' : 'desc');
    const orderBy: Prisma.TutorProfileOrderByWithRelationInput =
      q.sortBy === 'name' ? { employee: { firstName: dir } } : q.sortBy === 'tutorCode' ? { tutorCode: dir } : { verifiedAt: dir };

    const rows = await this.prisma.tutorProfile.findMany({
      where: { AND: and },
      orderBy,
      take: 500,
      select: {
        id: true, tutorCode: true, tutorOperationalStatus: true, verifiedAt: true, sourceTutorLeadId: true,
        verifiedBy: userSelect,
        employee: { select: { firstName: true, lastName: true, phone: true, user: { select: { email: true, mustChangePassword: true } } } },
        subjects: { where: { isActive: true }, select: { subject: { select: { name: true } } } },
        grades: { where: { isActive: true }, select: { grade: { select: { name: true } } } },
        tutorLead: { select: { demoEvaluations: { orderBy: { evaluatedAt: 'desc' }, take: 1, select: { englishRating: true } } } },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      tutorId: r.tutorCode,
      name: `${r.employee.firstName} ${r.employee.lastName}`.trim(),
      email: r.employee.user.email,
      phone: r.employee.phone,
      status: r.tutorOperationalStatus,
      subjects: r.subjects.map((x) => x.subject.name),
      grades: r.grades.map((x) => x.grade.name),
      englishRating: r.tutorLead?.demoEvaluations[0]?.englishRating ?? null,
      accountPendingFirstLogin: r.employee.user.mustChangePassword,
      verifiedAt: r.verifiedAt,
      verifiedBy: r.verifiedBy,
      candidateId: r.sourceTutorLeadId,
    }));
  }

  // ── Profile ───────────────────────────────────────────────────────────────

  async getProfile(id: string, viewerUserId: string) {
    await this.load(id);
    const [canManage, canNotes] = await Promise.all([
      this.rbac.hasPermissions(viewerUserId, [PROFILE_MANAGE]),
      this.rbac.hasPermissions(viewerUserId, [NOTES_MANAGE]),
    ]);
    const p = await this.prisma.tutorProfile.findUniqueOrThrow({
      where: { id },
      include: {
        employee: { select: { businessId: true, firstName: true, lastName: true, phone: true, joinedAt: true, user: { select: { email: true, status: true, mustChangePassword: true } } } },
        verifiedBy: userSelect,
        personalDetails: true,
        emergencyContacts: { orderBy: { kind: 'asc' } },
        qualifications: { where: { isActive: true }, orderBy: [{ yearOfCompletion: 'desc' }, { createdAt: 'asc' }] },
        subjects: { where: { isActive: true }, include: { subject: true } },
        grades: { where: { isActive: true }, include: { grade: true } },
        curricula: { where: { isActive: true }, include: { curriculum: true } },
        tutorLead: {
          select: {
            id: true, businessId: true, remarks: true, detailsDescription: true,
            motherTongue: { select: { name: true } },
            languages: { select: { language: { select: { name: true } } } },
            demoEvaluations: { orderBy: { evaluatedAt: 'desc' }, include: { evaluatedBy: userSelect } },
          },
        },
      },
    });
    const d = p.personalDetails;
    const personal = d ? { ...d, bankAccountNumber: canManage ? d.bankAccountNumber : maskAccountNumber(d.bankAccountNumber) } : null;
    const lead = p.tutorLead;
    return {
      id: p.id,
      tutorId: p.tutorCode,
      status: p.tutorOperationalStatus,
      verifiedAt: p.verifiedAt,
      verifiedBy: p.verifiedBy,
      employee: p.employee,
      // Coordinator assignment arrives with Tutor Coordination (Step 5).
      coordinator: null as null | { id: string; email: string },
      personal,
      emergencyContacts: p.emergencyContacts,
      emergencyContactAlert: EMERGENCY_CONTACT_ALERT,
      qualifications: p.qualifications,
      subjects: p.subjects.map((x) => x.subject),
      grades: p.grades.map((x) => x.grade),
      curricula: p.curricula.map((x) => x.curriculum),
      hiring: lead && {
        candidateId: lead.id,
        candidateBusinessId: lead.businessId,
        hiringRemarks: lead.remarks,
        description: lead.detailsDescription,
        motherTongue: lead.motherTongue?.name ?? null,
        languages: lead.languages.map((x) => x.language.name),
        englishRating: lead.demoEvaluations[0]?.englishRating ?? null,
        demoEvaluations: lead.demoEvaluations.map((e) => ({
          id: e.id, evaluatedAt: e.evaluatedAt, evaluatedBy: e.evaluatedBy, englishRating: e.englishRating,
          teachingMethods: e.teachingMethods, technicalSkills: e.technicalSkills, remarks: e.remarks,
        })),
      },
      gaps: profileGaps({
        hasPrimaryContact: p.emergencyContacts.some((c) => c.kind === 'PRIMARY'),
        gender: d?.gender, permDistrict: d?.permDistrict, bankAccountNumber: d?.bankAccountNumber, qualifications: p.qualifications.length,
      }),
      access: { canManage, canSeeNotes: canNotes, canSeeHistory: canNotes, bankFullyVisible: canManage },
    };
  }

  /** Edits are audited field by field (bank account masked). Name changes update the employee record. */
  async updateProfile(id: string, dto: UpdateTutorProfileDto, actorUserId: string) {
    const p = await this.load(id);
    const lead = p.sourceTutorLeadId
      ? await this.prisma.tutorLead.findUnique({ where: { id: p.sourceTutorLeadId }, select: { phone: true, phoneNormalized: true } })
      : null;
    const existing = await this.prisma.tutorPersonalDetails.findUnique({ where: { tutorProfileId: id } });
    const contacts = await this.prisma.tutorEmergencyContact.findMany({ where: { tutorProfileId: id } });
    const hasPrimary = contacts.some((c) => c.kind === 'PRIMARY');

    // Primary emergency contact is compulsory and must differ from the tutor's own number.
    const primaryPhone = dto.primaryContact ? this.contactPhone(dto.primaryContact) : null;
    if (primaryPhone) this.rule(() => assertPrimaryDiffers(primaryPhone, [p.employee.phone, lead?.phone, lead?.phoneNormalized]));
    const secondaryPhone = dto.secondaryContact ? this.contactPhone(dto.secondaryContact) : null;
    if (dto.secondaryContact && !hasPrimary && !dto.primaryContact) {
      throw new BadRequestException('Add the primary emergency contact first; it is compulsory');
    }

    let details: Details = {};
    if (dto.gender !== undefined) details.gender = dto.gender;
    if (dto.maritalStatus !== undefined) details.maritalStatus = dto.maritalStatus;
    if (dto.permanentAddress) details = { ...details, ...this.addressData('perm', dto.permanentAddress) };
    if (dto.currentAddress) details = { ...details, ...this.addressData('cur', dto.currentAddress) };
    if (dto.currentSameAsPermanent !== undefined) details.currentSameAsPermanent = dto.currentSameAsPermanent;
    if (dto.bank) {
      const t = clean;
      details = {
        ...details,
        bankAccountHolder: t(dto.bank.accountHolder), bankName: t(dto.bank.bank), bankBranch: t(dto.bank.branch),
        bankAccountNumber: t(dto.bank.accountNumber), bankIfsc: t(dto.bank.ifsc)?.toUpperCase() ?? t(dto.bank.ifsc),
      };
    }
    for (const k of Object.keys(details)) if (details[k] === undefined) delete details[k];
    const merged: Details = { ...(existing ?? {}), ...details };
    if (merged.currentSameAsPermanent) details = { ...details, ...copyPermanentToCurrent(merged as AddressRecord), currentSameAsPermanent: true };
    for (const k of Object.keys(details)) if (!DETAIL_KEYS.includes(k as never)) delete details[k];

    const employee: Details = {};
    if (dto.firstName !== undefined) employee.firstName = dto.firstName.trim();
    if (dto.lastName !== undefined) employee.lastName = dto.lastName.trim();

    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const before: Details = {};
      const after: Details = {};
      if (Object.keys(employee).length) {
        await tx.employee.update({ where: { id: p.employee.id }, data: employee });
        for (const [k, v] of Object.entries(employee)) {
          const old = (p.employee as Details)[k];
          if (old !== v) { before[k] = old; after[k] = v; }
        }
      }
      if (Object.keys(details).length) {
        await tx.tutorPersonalDetails.upsert({
          where: { tutorProfileId: id },
          create: { tutorProfileId: id, ...(details as object) },
          update: details,
        });
        for (const [k, v] of Object.entries(details)) {
          const old = existing ? (existing as Details)[k] ?? null : null;
          if (JSON.stringify(old) !== JSON.stringify(v ?? null)) { before[k] = old; after[k] = v ?? null; }
        }
      }
      const saveContact = async (kind: 'PRIMARY' | 'SECONDARY', c: EmergencyContactDto, phone: string) => {
        const old = contacts.find((x) => x.kind === kind);
        const data = { name: c.name.trim(), phone, relationship: c.relationship.trim() };
        await tx.tutorEmergencyContact.upsert({
          where: { tutorProfileId_kind: { tutorProfileId: id, kind } }, create: { tutorProfileId: id, kind, ...data }, update: data,
        });
        before[`${kind.toLowerCase()}Contact`] = old ? { name: old.name, phone: old.phone, relationship: old.relationship } : null;
        after[`${kind.toLowerCase()}Contact`] = data;
      };
      if (dto.primaryContact && primaryPhone) await saveContact('PRIMARY', dto.primaryContact, primaryPhone);
      if (dto.secondaryContact && secondaryPhone) await saveContact('SECONDARY', dto.secondaryContact, secondaryPhone);
      if (dto.secondaryContact === null) {
        const old = contacts.find((x) => x.kind === 'SECONDARY');
        if (old) {
          await tx.tutorEmergencyContact.delete({ where: { id: old.id } });
          before.secondaryContact = { name: old.name, phone: old.phone, relationship: old.relationship };
          after.secondaryContact = null;
        }
      }
      if (!Object.keys(after).length) return { id, changed: [] as string[] };
      await this.audit.recordInTx(tx, {
        entityType: 'TutorProfile', entityId: id, action: 'TUTOR_PROFILE_UPDATED', actorUserId,
        oldValue: this.safe(before), newValue: this.safe(after),
      });
      return { id, changed: Object.keys(after) };
    });
  }

  // ── Qualifications ────────────────────────────────────────────────────────

  async addQualification(id: string, dto: QualificationDto, actorUserId: string) {
    await this.load(id);
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const q = await tx.tutorQualification.create({
        data: { tutorProfileId: id, name: dto.name.trim(), institution: dto.institution.trim(), yearOfCompletion: dto.yearOfCompletion ?? null, createdByUserId: actorUserId },
      });
      await this.audit.recordInTx(tx, {
        entityType: 'TutorProfile', entityId: id, action: 'TUTOR_QUALIFICATION_ADDED', actorUserId,
        newValue: { qualificationId: q.id, name: q.name, institution: q.institution, yearOfCompletion: q.yearOfCompletion },
      });
      return q;
    });
  }

  async updateQualification(id: string, qualificationId: string, dto: QualificationDto, actorUserId: string) {
    await this.load(id);
    const q = await this.prisma.tutorQualification.findFirst({ where: { id: qualificationId, tutorProfileId: id, isActive: true } });
    if (!q) throw new NotFoundException('Qualification not found');
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const data = { name: dto.name.trim(), institution: dto.institution.trim(), yearOfCompletion: dto.yearOfCompletion ?? null };
      const updated = await tx.tutorQualification.update({ where: { id: qualificationId }, data });
      await this.audit.recordInTx(tx, {
        entityType: 'TutorProfile', entityId: id, action: 'TUTOR_QUALIFICATION_UPDATED', actorUserId,
        oldValue: { qualificationId, name: q.name, institution: q.institution, yearOfCompletion: q.yearOfCompletion },
        newValue: { qualificationId, ...data },
      });
      return updated;
    });
  }

  /** Hides the entry; the row and its audit trail are kept. */
  async removeQualification(id: string, qualificationId: string, actorUserId: string) {
    await this.load(id);
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const res = await tx.tutorQualification.updateMany({
        where: { id: qualificationId, tutorProfileId: id, isActive: true }, data: { isActive: false, removedAt: new Date() },
      });
      if (res.count !== 1) throw new NotFoundException('Qualification not found');
      await this.audit.recordInTx(tx, {
        entityType: 'TutorProfile', entityId: id, action: 'TUTOR_QUALIFICATION_REMOVED', actorUserId, metadata: { qualificationId },
      });
      return { id: qualificationId, removed: true };
    });
  }

  // ── Status ────────────────────────────────────────────────────────────────

  async changeStatus(id: string, dto: ChangeTutorStatusDto, actorUserId: string) {
    const p = await this.load(id);
    const current = p.tutorOperationalStatus as TutorStatus;
    const reason = dto.reason.trim();
    this.rule(() => assertStatusChange(current, dto.status, reason));
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const res = await tx.tutorProfile.updateMany({ where: { id, tutorOperationalStatus: current }, data: { tutorOperationalStatus: dto.status } });
      if (res.count !== 1) throw new ConflictException('Status changed; reload and retry');
      const h = await tx.tutorStatusHistory.create({
        data: { tutorProfileId: id, previousStatus: current, newStatus: dto.status, reason, changedByUserId: actorUserId },
      });
      await this.audit.recordInTx(tx, {
        entityType: 'TutorProfile', entityId: id, action: 'TUTOR_STATUS_CHANGED', actorUserId, reason,
        oldValue: { status: current }, newValue: { status: dto.status },
      });
      return { id, status: dto.status, historyId: h.id };
    });
  }

  // ── HR-only: History & Status and HR Internal Notes ───────────────────────

  /** Complete journey from hiring onward, newest first. Nothing here is ever overwritten. */
  async history(id: string) {
    const p = await this.load(id);
    const leadId = p.sourceTutorLeadId;
    const [statuses, profileEvents, stages, decisions, leadStatuses, attempts] = await Promise.all([
      this.prisma.tutorStatusHistory.findMany({ where: { tutorProfileId: id }, include: { changedBy: userSelect } }),
      this.prisma.auditEvent.findMany({ where: { entityType: 'TutorProfile', entityId: id }, orderBy: { timestamp: 'desc' }, take: 200 }),
      leadId ? this.prisma.tutorLeadStageHistory.findMany({ where: { tutorLeadId: leadId }, include: { changedBy: userSelect } }) : [],
      leadId ? this.prisma.tutorLeadDecisionHistory.findMany({ where: { tutorLeadId: leadId }, include: { changedBy: userSelect } }) : [],
      leadId ? this.prisma.tutorLeadStatusHistory.findMany({ where: { tutorLeadId: leadId }, include: { changedBy: userSelect } }) : [],
      leadId
        ? this.prisma.tutorTrainingAttempt.findMany({
            where: { enrolment: { tutorLeadId: leadId }, attendance: { not: null } },
            include: { recordedBy: userSelect, session: { select: { scheduledAt: true } } },
          })
        : [],
    ]);
    type Item = { at: Date; area: string; title: string; detail?: string | null; by?: string | null };
    const items: Item[] = [
      ...statuses.map((s) => ({ at: s.changedAt, area: 'Status', title: `${s.previousStatus ?? '—'} → ${s.newStatus}`, detail: s.reason, by: s.changedBy.email })),
      ...profileEvents
        .filter((e) => e.action !== 'TUTOR_STATUS_CHANGED')
        .map((e) => ({ at: e.timestamp, area: 'Profile', title: e.action.replace(/^TUTOR_/, '').replace(/_/g, ' ').toLowerCase(), detail: e.reason ?? null, by: e.actorUserId })),
      ...stages.map((s) => ({ at: s.changedAt, area: 'Hiring', title: `Stage ${s.previousStage ?? '—'} → ${s.newStage}`, detail: s.remarks, by: s.changedBy.email })),
      ...decisions.map((d) => ({ at: d.changedAt, area: 'Hiring', title: `Decision ${d.previousDecision ?? '—'} → ${d.newDecision}`, detail: d.remarks, by: d.changedBy.email })),
      ...leadStatuses.map((s) => ({ at: s.changedAt, area: 'Hiring', title: `Lead status ${s.previousStatus ?? '—'} → ${s.newStatus}`, detail: s.remarks, by: s.changedBy.email })),
      ...attempts.map((a) => ({
        at: a.recordedAt ?? a.session.scheduledAt, area: 'Training',
        title: `Session ${a.sessionNumber}: ${a.attendance}${a.taskCompleted ? ', task completed' : ', task not completed'}`,
        detail: a.remarks, by: a.recordedBy?.email ?? null,
      })),
    ];
    // Audit rows store the actor id; resolve to emails in one query.
    const ids = [...new Set(profileEvents.map((e) => e.actorUserId).filter((x): x is string => !!x))];
    const users = ids.length ? await this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, email: true } }) : [];
    const email = new Map(users.map((u) => [u.id, u.email]));
    return items
      .map((i) => (i.area === 'Profile' && i.by ? { ...i, by: email.get(i.by) ?? i.by } : i))
      .sort((a, b) => b.at.getTime() - a.at.getTime());
  }

  async listNotes(id: string) {
    await this.load(id);
    return this.prisma.tutorHrNote.findMany({
      where: { tutorProfileId: id },
      orderBy: { createdAt: 'desc' },
      include: { createdBy: userSelect, revisions: { orderBy: { editedAt: 'desc' }, include: { editedBy: userSelect } } },
    });
  }

  async addNote(id: string, dto: HrNoteDto, actorUserId: string) {
    await this.load(id);
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const n = await tx.tutorHrNote.create({ data: { tutorProfileId: id, body: dto.body.trim(), createdByUserId: actorUserId } });
      // Content is confidential: the audit row records that a note exists, not its text.
      await this.audit.recordInTx(tx, { entityType: 'TutorProfile', entityId: id, action: 'TUTOR_HR_NOTE_ADDED', actorUserId, metadata: { noteId: n.id } });
      return n;
    });
  }

  /** Editing keeps the earlier text as a revision with who and when. */
  async editNote(id: string, noteId: string, dto: HrNoteDto, actorUserId: string) {
    await this.load(id);
    const n = await this.prisma.tutorHrNote.findFirst({ where: { id: noteId, tutorProfileId: id } });
    if (!n) throw new NotFoundException('Note not found');
    const body = dto.body.trim();
    if (body === n.body) throw new BadRequestException('Nothing changed');
    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const now = new Date();
      await tx.tutorHrNoteRevision.create({ data: { noteId, previousBody: n.body, editedByUserId: actorUserId, editedAt: now } });
      const res = await tx.tutorHrNote.updateMany({ where: { id: noteId, body: n.body }, data: { body, editedAt: now } });
      if (res.count !== 1) throw new ConflictException('The note changed; reload and retry');
      await this.audit.recordInTx(tx, { entityType: 'TutorProfile', entityId: id, action: 'TUTOR_HR_NOTE_EDITED', actorUserId, metadata: { noteId } });
      return { id: noteId, editedAt: now };
    });
  }
}
