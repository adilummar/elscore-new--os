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
};

const DEFAULTS: Record<string, () => Row> = {
  mentoringStage: () => ({ status: 'NOT_STARTED', startedAt: null, completedAt: null, pendingReviewAt: null, verifiedByUserId: null }),
  stageChecklistResponse: () => ({ state: 'PENDING_COLLECTION', value: null, note: null, reason: null, evidenceRef: null, updatedByUserId: null }),
  mentoringTask: () => ({ status: 'OPEN', priority: 'MEDIUM', statusBeforeHold: null, holdReason: null, evidence: null, returnReason: null, stageId: null, dueAt: null, description: null }),
  finalApproval: () => ({ decision: 'PENDING', decidedByUserId: null, decidedAt: null, comment: null, returnToStage: null }),
  workflowHold: () => ({ resolvedAt: null, resolvedByUserId: null, resolution: null, stageId: null, previousStageStatus: null, pendingAction: null, dependency: null }),
};

let counter = 0;
const nextId = (prefix: string) => `${prefix}-${++counter}`;

function matches(db: FakeDb, table: string, row: Row, where?: Row): boolean {
  if (!where) return true;
  return Object.entries(where).every(([key, cond]) => {
    if (key === 'AND') return (cond as Row[]).every((w) => matches(db, table, row, w));
    if (key === 'OR') return (cond as Row[]).some((w) => matches(db, table, row, w));
    if (cond === undefined) return true;
    if (cond instanceof Date || cond === null || typeof cond !== 'object') return row[key] === cond;

    const c = cond as Row;
    if ('in' in c) return (c.in as unknown[]).includes(row[key]);
    if ('notIn' in c) return !(c.notIn as unknown[]).includes(row[key]);
    if ('not' in c) return row[key] !== c.not;
    if ('contains' in c) return String(row[key] ?? '').toLowerCase().includes(String(c.contains).toLowerCase());

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
    this.$transaction = jest.fn((cb: (tx: any) => unknown) => Promise.resolve(cb(proxy)));
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
      const { stages, ...rest } = data;
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
        Object.assign(r, args.data, { updatedAt: new Date() });
        return Promise.resolve({ ...r });
      }),
      delete: jest.fn((args: Row) => {
        const r = find(args);
        if (!r) return Promise.reject(new Error(`${table} not found`));
        this.tables[table] = this.rows(table).filter((x) => x !== r);
        return Promise.resolve({ ...r });
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
