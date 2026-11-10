/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument */
/**
 * A small stateful in-memory stand-in for the Prisma client, used by Mentoring unit tests that must
 * prove state really persists between separate service instances (for example "pause, leave, log back
 * in, resume"). It implements only the query surface the Mentoring services use.
 *
 * It is NOT a database: there is no isolation or rollback, and relation filters rely on relation objects
 * that tests denormalise onto rows (for example userRole rows carry `role` and `user` objects).
 */
type Row = Record<string, any>;

const UNIQUE: Record<string, string[][]> = {
  mentoringStage: [['activationId', 'stageNumber']],
  stageChecklistResponse: [['stageId', 'itemKey']],
  workflowException: [['stageId', 'itemKey']],
  enrollmentHandoverField: [['handoverId', 'fieldKey']],
  enrollmentHandoverFieldVerification: [['handoverId', 'fieldKey']],
  notification: [['dedupeKey']],
  mentoringTutorAssignment: [['currentKey']],
  mentoringLearningPlan: [['currentKey']],
  mentoringSlaItem: [['currentKey']],
  tutorClassRecord: [['sessionId', 'tutorId']],
  mentoringSlaPolicy: [['key']],
  mentoringReminder: [['currentKey']],
  mentoringReviewMeeting: [['currentKey']],
  mentoringLearningPlanSubject: [['planId', 'subjectId']],
  mentoringLearningPlanRevision: [['planId', 'version']],
  mentoringExam: [['dateKey']],
  mentoringExamItem: [['examId', 'kind']],
};

const DEFAULTS: Record<string, () => Row> = {
  tutorAvailabilityException: () => ({ isActive: true, deactivatedAt: null }),
  mentoringReminder: () => ({ status: 'PREPARED', preparedAt: new Date(), scheduledFor: null, sentAt: null, sentByUserId: null, notificationId: null, acknowledgedAt: null }),
  mentoringSlaItem: () => ({ status: 'OPEN', firstResponseAt: null, completedAt: null }),
  mentoringClassSession: () => ({ status: 'SCHEDULED', activities: [], conducted: null, actualStartMinute: null, actualEndMinute: null, actualMinutes: null, subjectCovered: null, topicsCovered: null, attendance: null, participation: null, classNotes: null, notConductedReason: null, otherActivity: null, evaluationRemarks: null, coveredRemarks: null, voiceSentAt: null, voiceReceivedAt: null, voiceReceivedByUserId: null, voiceRemarks: null, tutorSubmittedAt: null, tutorSubmittedByUserId: null, mentorRemarks: null, returnedReason: null, returnedKind: null, verifiedAt: null, verifiedByUserId: null, verifiedMinutes: null, tutorClassRecordId: null }),
  mentoringExam: () => ({ kind: 'EXAM', originalExamId: null, chapters: [], portion: null, responsibleUserId: null, responsibleName: null, tutorUserId: null, instructions: null, dateKey: null, conducted: null, conductedAt: null, conductedByUserId: null, notConductedReason: null, informedAt: null, informedByUserId: null, informedNote: null, reExamRequired: false, reExamReason: null, marksObtained: null, maxMarks: null, percentage: null, evaluatingTutorUserId: null, evaluationDate: null, marksRecordedAt: null, marksRecordedByUserId: null, weaknesses: null, topicsToImprove: null, tutorSuggestions: null, mentorRemarks: null }),
  mentoringExamItem: () => ({ status: 'PENDING', responsible: null, remarks: null, evidenceRef: null, updatedByUserId: null, doneAt: null }),
  mentoringExamEvent: () => ({ actorUserId: null, reason: null, payload: null }),
  tutorSubject: () => ({ isActive: true }),
  tutorGrade: () => ({ isActive: true }),
  tutorAvailabilitySlot: () => ({ isActive: true }),
  mentoringStage: () => ({ status: 'NOT_STARTED', startedAt: null, completedAt: null, pendingReviewAt: null, verifiedByUserId: null }),
  stageChecklistResponse: () => ({ state: 'PENDING_COLLECTION', value: null, note: null, reason: null, evidenceRef: null, updatedByUserId: null }),
  mentoringTask: () => ({ status: 'OPEN', priority: 'MEDIUM', statusBeforeHold: null, holdReason: null, evidence: null, returnReason: null, stageId: null, dueAt: null, description: null }),
  finalApproval: () => ({ decision: 'PENDING', decidedByUserId: null, decidedAt: null, comment: null, returnToStage: null }),
  workflowHold: () => ({ resolvedAt: null, resolvedByUserId: null, resolution: null, stageId: null, previousStageStatus: null, pendingAction: null, dependency: null }),
};

/** Prisma's DbNull and JsonNull markers mean "store null"; the fake keeps a plain null. */
const plain = (data: Row): Row => Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v && typeof v === 'object' && ['DbNull', 'JsonNull', 'AnyNull'].includes((v as object).constructor?.name) ? null : v]));

let counter = 0;
const nextId = (prefix: string) => `${prefix}-${++counter}`;

function matches(db: FakeDb, table: string, row: Row, where?: Row): boolean {
  if (!where) return true;
  return Object.entries(where).every(([key, cond]) => {
    if (key === 'AND') return (cond as Row[]).every((w) => matches(db, table, row, w));
    if (key === 'OR') return (cond as Row[]).some((w) => matches(db, table, row, w));
    if (cond === undefined) return true;
    // Dates are compared by value, as the database does.
    if (cond instanceof Date) return row[key] instanceof Date ? row[key].getTime() === cond.getTime() : row[key] === cond;
    if (cond === null || typeof cond !== 'object') return row[key] === cond;

    const c = cond as Row;
    if ('in' in c) return (c.in as unknown[]).includes(row[key]);
    if ('notIn' in c) return !(c.notIn as unknown[]).includes(row[key]);
    if ('not' in c) return row[key] !== c.not;
    if ('gte' in c || 'lte' in c || 'gt' in c || 'lt' in c) {
      const v = row[key] as number | Date | null | undefined;
      if (v === null || v === undefined) return false;
      const n = (x: unknown) => (x instanceof Date ? x.getTime() : (x as number));
      return (!('gte' in c) || n(v) >= n(c.gte)) && (!('lte' in c) || n(v) <= n(c.lte)) && (!('gt' in c) || n(v) > n(c.gt)) && (!('lt' in c) || n(v) < n(c.lt));
    }
    if ('contains' in c) return String(row[key] ?? '').toLowerCase().includes(String(c.contains).toLowerCase());
    if ('startsWith' in c) return String(row[key] ?? '').startsWith(String(c.startsWith));
    if ('endsWith' in c) return String(row[key] ?? '').endsWith(String(c.endsWith));

    // Compound unique selector such as { activationId_stageNumber: { activationId, stageNumber } }.
    if (!(key in row) && key.includes('_')) return matches(db, table, row, c);

    // Relation filters.
    if ('some' in c) return db.related(table, key, row).some((r) => matches(db, key, r, c.some));
    const rel = db.related(table, key, row);
    if (rel.length) return rel.some((r) => matches(db, key, r, c));
    if (row[key] && typeof row[key] === 'object') return matches(db, key, row[key], c);
    return false;
  });
}

export class FakeDb {
  tables: Record<string, Row[]> = {};
  $executeRaw = jest.fn().mockResolvedValue(1);
  $transaction: jest.Mock;
  /** Row locks taken with SELECT ... FOR UPDATE, held until the transaction that took them ends. */
  private locks = new Map<string, { owner: symbol; released: Promise<void> }>();

  // Model accessors are created lazily so tests can use any model name the services touch.
  [model: string]: any;

  constructor() {
    const proxy: FakeDb = new Proxy(this, {
      get: (target, prop: string) => {
        if (prop in target || typeof prop === 'symbol') return (target as any)[prop];
        return target.model(prop);
      },
    });
    // Transactions hand the callback the proxy so model accessors resolve inside them too.
    this.$transaction = jest.fn(async (cb: (tx: any) => unknown) => {
      // Each transaction gets its own handle, so a FOR UPDATE lock belongs to it and a second transaction waits for it.
      const held: Array<() => void> = [];
      const owner = Symbol('transaction');
      const tx = Object.create(proxy) as FakeDb;
      Object.defineProperty(tx, '$executeRaw', {
        value: async (strings: TemplateStringsArray, ...values: unknown[]) => {
          await this.$executeRaw(strings, ...values);
          const sql = strings.join('?');
          if (!/FOR UPDATE/i.test(sql)) return 1;
          const key = `${sql}${JSON.stringify(values)}`;
          // Like Postgres, a transaction can lock a row it already holds; only another transaction waits.
          for (let lock = this.locks.get(key); lock && lock.owner !== owner; lock = this.locks.get(key)) await lock.released;
          if (this.locks.get(key)?.owner === owner) return 1;
          let release!: () => void;
          this.locks.set(key, { owner, released: new Promise<void>((r) => (release = r)) });
          held.push(() => { this.locks.delete(key); release(); });
          return 1;
        },
      });
      try {
        return await cb(tx);
      } finally {
        held.forEach((f) => f());
      }
    });
    return proxy;
  }

  rows(table: string): Row[] {
    return (this.tables[table] ??= []);
  }

  seed(table: string, row: Row): Row {
    const full = { ...(DEFAULTS[table]?.() ?? {}), id: nextId(table), createdAt: new Date(), updatedAt: new Date(), ...row };
    this.rows(table).push(full);
    return full;
  }

  /** Resolves a relation by naming convention for the filters and includes the services use. */
  related(table: string, name: string, row: Row): Row[] {
    const t = this.tables;
    const by = (tbl: string, field: string, value: unknown) => (t[tbl] ?? []).filter((r) => r[field] === value);
    switch (`${table}.${name}`) {
      case 'mentoringActivation.tasks': return by('mentoringTask', 'activationId', row.id);
      case 'mentoringActivation.student': return by('student', 'id', row.studentId);
      case 'mentoringActivation.lead': return by('lead', 'id', row.leadId);
      case 'mentoringActivation.handover': return by('enrollmentHandover', 'id', row.handoverId);
      case 'mentoringActivation.stages': return by('mentoringStage', 'activationId', row.id);
      case 'mentoringActivation.holds': return by('workflowHold', 'activationId', row.id);
      case 'mentoringActivation.approvals': return by('finalApproval', 'activationId', row.id);
      case 'mentoringStage.checklist': return by('stageChecklistResponse', 'stageId', row.id);
      case 'mentoringStage.exceptions': return by('workflowException', 'stageId', row.id);
      case 'mentoringTask.comments': return by('mentoringTaskComment', 'taskId', row.id);
      case 'mentoringTask.activation': return by('mentoringActivation', 'id', row.activationId);
      case 'mentoringTask.stage': return by('mentoringStage', 'id', row.stageId);
      case 'user.employee': return by('employee', 'userId', row.id);
      case 'userRole.role': return row.roleId === undefined ? [] : by('role', 'id', row.roleId);
      default: return [];
    }
  }

  private withIncludes(table: string, row: Row, include?: Row, select?: Row): Row {
    const out = { ...row };
    const spec = { ...(include ?? {}), ...(select ?? {}) };
    for (const [name, opt] of Object.entries(spec)) {
      if (typeof opt === 'boolean' && !opt) continue;
      if (name === 'employee' || name === 'role' || ['stages', 'tasks', 'holds', 'approvals', 'checklist', 'exceptions', 'comments', 'student', 'lead', 'handover', 'activation', 'stage'].includes(name)) {
        const rel = this.related(table, name, row);
        const nested = typeof opt === 'object' ? ((opt as Row).include ?? undefined) : undefined;
        const nestedSelect = typeof opt === 'object' ? ((opt as Row).select ?? undefined) : undefined;
        const relTable: Record<string, string> = { role: 'role', stages: 'mentoringStage', stage: 'mentoringStage', tasks: 'mentoringTask', activation: 'mentoringActivation', handover: 'enrollmentHandover' };
        const mapped = rel.map((r) => this.withIncludes(relTable[name] ?? name, r, nested, nestedSelect));
        const single = ['student', 'lead', 'handover', 'activation', 'stage', 'employee', 'role'].includes(name);
        // A relation object a test denormalised onto the row (for example userRole.role) is kept when no row resolves.
        out[name] = single ? (mapped[0] ?? row[name] ?? null) : mapped;
      }
    }
    return out;
  }

  private sort(rows: Row[], orderBy?: Row | Row[]) {
    const o = Array.isArray(orderBy) ? orderBy[0] : orderBy;
    if (!o) return rows;
    const [field, dir] = Object.entries(o)[0] as [string, string];
    return [...rows].sort((a, b) => (a[field] > b[field] ? 1 : a[field] < b[field] ? -1 : 0) * (dir === 'desc' ? -1 : 1));
  }

  model(table: string) {
    const find = (args: Row = {}) => this.rows(table).find((r) => matches(this, table, r, args.where));
    const findMany = (args: Row = {}) => {
      let list = this.rows(table).filter((r) => matches(this, table, r, args.where));
      list = this.sort(list, args.orderBy);
      if (args.skip) list = list.slice(args.skip);
      if (args.take) list = list.slice(0, args.take);
      return list.map((r) => this.withIncludes(table, r, args.include, args.select));
    };
    const insert = (data: Row) => {
      for (const keys of UNIQUE[table] ?? []) {
        if (keys.every((k) => data[k] !== undefined && data[k] !== null) &&
          this.rows(table).some((r) => keys.every((k) => r[k] === data[k]))) {
          const err: any = new Error(`Unique constraint failed on ${table}`);
          err.code = 'P2002';
          throw err;
        }
      }
      const { stages, ...rest } = plain(data);
      const row = this.seed(table, { ...rest });
      if (stages?.create) for (const s of stages.create) this.seed('mentoringStage', { ...s, activationId: row.id });
      return row;
    };
    return {
      findUnique: jest.fn((args: Row) => { const r = find(args); return Promise.resolve(r ? this.withIncludes(table, r, args.include, args.select) : null); }),
      findUniqueOrThrow: jest.fn((args: Row) => { const r = find(args); if (!r) return Promise.reject(new Error(`${table} not found`)); return Promise.resolve(this.withIncludes(table, r, args.include, args.select)); }),
      findFirst: jest.fn((args: Row) => { const r = find(args); return Promise.resolve(r ? this.withIncludes(table, r, args.include, args.select) : null); }),
      findMany: jest.fn((args: Row) => Promise.resolve(findMany(args))),
      count: jest.fn((args: Row = {}) => Promise.resolve(this.rows(table).filter((r) => matches(this, table, r, args.where)).length)),
      create: jest.fn((args: Row) => Promise.resolve(insert(args.data))),
      createMany: jest.fn((args: Row) => {
        let n = 0;
        for (const d of args.data as Row[]) {
          try { insert(d); n++; } catch (e: any) { if (!(args.skipDuplicates && e.code === 'P2002')) throw e; }
        }
        return Promise.resolve({ count: n });
      }),
      update: jest.fn((args: Row) => {
        const r = find(args);
        if (!r) return Promise.reject(new Error(`${table} not found`));
        Object.assign(r, plain(args.data), { updatedAt: new Date() });
        return Promise.resolve({ ...r });
      }),
      delete: jest.fn((args: Row) => {
        const r = find(args);
        if (!r) return Promise.reject(new Error(`${table} not found`));
        this.tables[table] = this.rows(table).filter((x) => x !== r);
        return Promise.resolve({ ...r });
      }),
      deleteMany: jest.fn((args: Row = {}) => {
        const gone = this.rows(table).filter((r) => matches(this, table, r, args.where));
        this.tables[table] = this.rows(table).filter((r) => !gone.includes(r));
        return Promise.resolve({ count: gone.length });
      }),
      updateMany: jest.fn((args: Row) => {
        const list = this.rows(table).filter((r) => matches(this, table, r, args.where));
        list.forEach((r) => Object.assign(r, args.data, { updatedAt: new Date() }));
        return Promise.resolve({ count: list.length });
      }),
      upsert: jest.fn((args: Row) => {
        const r = find(args);
        if (r) { Object.assign(r, args.update, { updatedAt: new Date() }); return Promise.resolve({ ...r }); }
        return Promise.resolve(insert(args.create));
      }),
      groupBy: jest.fn((args: Row) => {
        const list = this.rows(table).filter((r) => matches(this, table, r, args.where));
        const by: string[] = args.by;
        const groups = new Map<string, Row[]>();
        for (const r of list) {
          const k = by.map((f) => r[f]).join('|');
          groups.set(k, [...(groups.get(k) ?? []), r]);
        }
        return Promise.resolve([...groups.values()].map((rows) => {
          const out: Row = {};
          by.forEach((f) => (out[f] = rows[0][f]));
          if (args._count) out._count = { _all: rows.length };
          if (args._max) {
            out._max = {};
            for (const f of Object.keys(args._max)) out._max[f] = rows.map((r) => r[f]).filter(Boolean).sort().pop() ?? null;
          }
          return out;
        }));
      }),
    };
  }
}

export const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
