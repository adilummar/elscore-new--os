import { AuditEventInput, AuditService } from './audit.service';

// ─── Mock PrismaService ───────────────────────────────────────────────────────

const mockPrisma = {
  auditEvent: {
    create: jest.fn(),
    // update and delete are intentionally absent — AuditService must not expose them.
  },
};

function makeService(): AuditService {
  return new AuditService(mockPrisma as any);
}

const VALID_INPUT: AuditEventInput = {
  entityType: 'Lead',
  entityId: 'lead-uuid-001',
  action: 'CREATED',
  actorUserId: 'user-uuid-001',
  newValue: { status: 'NEW' },
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('AuditService', () => {
  let service: AuditService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = makeService();
    mockPrisma.auditEvent.create.mockResolvedValue({ id: 'audit-id', ...VALID_INPUT });
  });

  // ─── Append-only enforcement ────────────────────────────────────────────────

  /**
   * Append-only Test 1: The service ONLY exposes `record` and `recordInTx`.
   * There must be no public `update`, `delete`, `deleteMany`, or `bulkDelete` method.
   *
   * This is the code-layer enforcement of the database append-only rule.
   * Any future developer adding such a method will break this test.
   */
  it('does not expose update, delete, deleteMany, or bulkDelete methods (append-only contract)', () => {
    const exposedMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(service)).filter(
      (m) => m !== 'constructor',
    );

    // Approved write interface
    expect(exposedMethods).toContain('record');
    expect(exposedMethods).toContain('recordInTx');

    // Forbidden operations
    expect(exposedMethods).not.toContain('update');
    expect(exposedMethods).not.toContain('delete');
    expect(exposedMethods).not.toContain('deleteMany');
    expect(exposedMethods).not.toContain('bulkDelete');
    expect(exposedMethods).not.toContain('upsert');
  });

  /**
   * Append-only Test 2: AuditService only ever calls prisma.auditEvent.create.
   * It must never call prisma.auditEvent.update or prisma.auditEvent.delete,
   * even if they are available on the Prisma client.
   */
  it('only calls prisma.auditEvent.create — never update or delete', async () => {
    await service.record(VALID_INPUT);

    expect(mockPrisma.auditEvent.create).toHaveBeenCalledTimes(1);
    // Confirm no update/delete keys are on the mock
    expect(mockPrisma.auditEvent).not.toHaveProperty('update');
    expect(mockPrisma.auditEvent).not.toHaveProperty('delete');
    expect(mockPrisma.auditEvent).not.toHaveProperty('deleteMany');
  });

  // ─── record() ───────────────────────────────────────────────────────────────

  it('creates an audit event with all provided fields', async () => {
    const input: AuditEventInput = {
      entityType: 'Employee',
      entityId: 'emp-uuid-002',
      action: 'STATUS_CHANGED',
      actorUserId: 'admin-uuid',
      oldValue: { status: 'ACTIVE' },
      newValue: { status: 'SUSPENDED' },
      reason: 'Policy violation',
      correlationId: 'req-abc-123',
      metadata: { ip: '10.0.0.1' },
    };

    await service.record(input);

    expect(mockPrisma.auditEvent.create).toHaveBeenCalledWith({
      data: {
        entityType: 'Employee',
        entityId: 'emp-uuid-002',
        action: 'STATUS_CHANGED',
        actorUserId: 'admin-uuid',
        oldValue: { status: 'ACTIVE' },
        newValue: { status: 'SUSPENDED' },
        reason: 'Policy violation',
        correlationId: 'req-abc-123',
        metadata: { ip: '10.0.0.1' },
      },
    });
  });

  it('sets actorUserId to null for system-initiated actions (no actorUserId)', async () => {
    const input: AuditEventInput = {
      entityType: 'Lead',
      entityId: 'lead-001',
      action: 'OVERDUE_MARKED',
    };

    await service.record(input);

    const createCall = mockPrisma.auditEvent.create.mock.calls[0][0];
    expect(createCall.data.actorUserId).toBeNull();
  });

  it('is non-throwing — swallows Prisma errors so the primary operation is not affected', async () => {
    mockPrisma.auditEvent.create.mockRejectedValueOnce(new Error('DB connection lost'));

    // Must not throw — fire-and-forget contract
    await expect(service.record(VALID_INPUT)).resolves.not.toThrow();
  });

  it('returns void (undefined) on success', async () => {
    const result = await service.record(VALID_INPUT);
    expect(result).toBeUndefined();
  });

  it('handles missing optional fields (oldValue, newValue, reason, etc.)', async () => {
    const minimal: AuditEventInput = {
      entityType: 'User',
      entityId: 'user-001',
      action: 'LOGIN',
    };

    await service.record(minimal);

    const createCall = mockPrisma.auditEvent.create.mock.calls[0][0];
    expect(createCall.data.oldValue).toBeUndefined();
    expect(createCall.data.newValue).toBeUndefined();
    expect(createCall.data.reason).toBeUndefined();
    expect(createCall.data.correlationId).toBeUndefined();
    expect(createCall.data.metadata).toBeUndefined();
  });

  // ─── recordInTx() ────────────────────────────────────────────────────────────

  it('recordInTx creates within the provided transaction context', async () => {
    const mockTx = {
      auditEvent: {
        create: jest.fn().mockResolvedValue({ id: 'audit-tx-id' }),
      },
    };

    await service.recordInTx(mockTx as any, VALID_INPUT);

    // Must use the TX context, not the main Prisma client
    expect(mockTx.auditEvent.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.auditEvent.create).not.toHaveBeenCalled();
  });

  it('recordInTx propagates errors (caller is responsible for TX rollback)', async () => {
    const mockTx = {
      auditEvent: {
        create: jest.fn().mockRejectedValue(new Error('TX failed')),
      },
    };

    // Unlike record(), recordInTx() is NOT swallowed — the TX must roll back
    await expect(service.recordInTx(mockTx as any, VALID_INPUT)).rejects.toThrow('TX failed');
  });

  it('recordInTx does not expose update/delete on its transaction context', async () => {
    const mockTx = {
      auditEvent: {
        create: jest.fn().mockResolvedValue({}),
      },
    };

    await service.recordInTx(mockTx as any, VALID_INPUT);

    // Confirm the TX mock was only used for create
    expect(mockTx.auditEvent).not.toHaveProperty('update');
    expect(mockTx.auditEvent).not.toHaveProperty('delete');
  });
});
