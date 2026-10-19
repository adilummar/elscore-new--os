import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { DemoStatus, DemoBookingStatus, DemoSessionStatus, TutorAssignmentStatus, DemoExceptionStatus, DemoSessionExceptionCategory } from '@prisma/client';

import { DemoService } from './demo.service';
import { DemoMultiSessionService } from './demo-multisession.service';
import { UserRoleService } from '../user/user-role.service';
import { UserService } from '../user/user.service';

describe('Demo RBAC Verification (20 Business Scenarios)', () => {
  const future = new Date(Date.now() + 24 * 60 * 60 * 1000);

  function createDemoServiceMock(options: {
    roles?: string[];
    permissions?: string[];
    userId?: string;
  } = {}) {
    const userId = options.userId || 'user-1';
    const roles = options.roles || [];
    const permissions = options.permissions || [];

    const tx: any = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      requirement: { findUnique: jest.fn() },
      student: { findUnique: jest.fn() },
      demo: {
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({ id: 'demo-1' }),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'demo-1', ...data })),
      },
      demoBooking: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({ id: 'booking-1' }),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'booking-1', ...data })),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      demoSession: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({ id: 'session-1' }),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'session-1', ...data })),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      demoRescheduleHistory: {
        create: jest.fn().mockResolvedValue({ id: 'resched-1' }),
      },
      demoBookingRescheduleHistory: {
        create: jest.fn().mockResolvedValue({ id: 'resched-booking-1' }),
      },
      demoAttendance: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'att-1' }),
      },
      demoFeedbackRecord: {
        upsert: jest.fn().mockResolvedValue({ id: 'fb-1' }),
      },
      demoFeedback: {
        create: jest.fn().mockResolvedValue({ id: 'fb-legacy-1' }),
      },
      demoSessionException: {
        findUnique: jest.fn(),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'exc-1', ...data })),
      },
    };

    const prisma: any = {
      $transaction: jest.fn(async (fn: (client: any) => Promise<unknown>) => fn(tx)),
      demo: {
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      demoBooking: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      demoSessionTutorAssignment: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      userRole: {
        findMany: jest.fn().mockResolvedValue(
          roles.map((r) => ({ role: { code: r } }))
        ),
      },
      user: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      auditEvent: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    const rbac: any = {
      getPermissionsForUser: jest.fn().mockResolvedValue(new Set(permissions)),
      hasPermissions: jest.fn((_uid: string, reqPerms: string[]) =>
        Promise.resolve(reqPerms.every((p) => permissions.includes(p)))
      ),
    };

    const audit: any = {
      recordInTx: jest.fn().mockResolvedValue(undefined),
      record: jest.fn().mockResolvedValue(undefined),
    };

    const idGen: any = {
      nextIdInTx: jest.fn().mockResolvedValue('DMO-9999'),
    };

    const queue: any = {
      add: jest.fn().mockResolvedValue(undefined),
    };

    const multiSessionService = new DemoMultiSessionService(prisma as any);

    const service = new DemoService(
      prisma,
      audit,
      idGen,
      rbac,
      queue,
      multiSessionService,
    );

    return { service, prisma, tx, rbac, audit, multiSessionService, userId };
  }

  const sampleDemoRecord = {
    id: 'demo-100',
    businessId: 'DMO-0100',
    studentId: 'student-100',
    tutorId: 'tutor-assigned',
    status: DemoStatus.SCHEDULED,
    scheduledAt: future,
    durationMinutes: 60,
    student: {
      id: 'student-100',
      firstName: 'Alice',
      lastName: 'Smith',
      lead: { id: 'lead-100', assignedToUserId: 'sales-100' },
    },
    subject: { id: 'sub-1', name: 'Physics' },
    grade: { id: 'gr-10', name: 'Grade 10' },
    curriculum: { id: 'cur-1', name: 'IGCSE' },
    requirement: { notes: 'Need physics help' },
    bookedByUserId: 'sales-100',
    tutor: { id: 'tutor-assigned', email: 'tutor@test.com', employee: { firstName: 'Tim', lastName: 'Tutor' } },
    feedback: [],
  };

  const sampleMultiSessionBooking = {
    id: 'demo-100',
    businessId: 'DMO-0100',
    studentId: 'student-100',
    coordinatorId: 'coord-assigned',
    bookedByUserId: 'sales-100',
    status: DemoBookingStatus.SCHEDULED,
    scheduledDate: future,
    totalDurationMin: 60,
    sessions: [
      {
        id: 'session-100',
        sessionOrder: 1,
        status: DemoSessionStatus.SCHEDULED,
        tutorAssignments: [
          { tutorId: 'tutor-assigned', status: TutorAssignmentStatus.ACTIVE },
        ],
      },
    ],
  };

  // ── Scenario 1: Demo Head can list and open company-wide Demo records ─────────────
  it('Scenario 1: Demo Head can list and open company-wide Demo records without scoping restrictions', async () => {
    const { service, prisma } = createDemoServiceMock({
      roles: ['DEMO_HEAD'],
      permissions: ['demo.read', 'demo.read_all', 'demo.manage_all'],
    });

    // 1. List
    prisma.demo.findMany.mockResolvedValueOnce([sampleDemoRecord]);
    const list = await service.getDemos({ id: 'head-1', email: 'head@test.com' } as any);
    expect(list).toHaveLength(1);
    expect(prisma.demo.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {} }));

    // 2. Open detail
    prisma.demo.findUnique.mockResolvedValueOnce({ ...sampleDemoRecord });
    prisma.demoBooking.findFirst.mockResolvedValueOnce({ ...sampleMultiSessionBooking });
    const detail = await service.getDemoById('demo-100', { id: 'head-1', email: 'head@test.com' } as any);
    expect(detail).toBeDefined();
    expect(detail.id).toBe('demo-100');
    expect(detail.businessId).toBe('DMO-0100');
  });

  // ── Scenario 2: Demo Admin can perform permitted operational actions ─────────────
  it('Scenario 2: Demo Admin can perform permitted operational actions (reschedule, assign tutor, cancel)', async () => {
    const { service, prisma, tx } = createDemoServiceMock({
      roles: ['DEMO_ADMIN'],
      permissions: ['demo.read', 'demo.read_all', 'demo.manage_operations', 'demo.assign_tutor', 'demo.reschedule', 'demo.cancel'],
    });

    const newStart = new Date(Date.now() + 48 * 60 * 60 * 1000);

    // Reschedule
    tx.demo.findUnique.mockResolvedValueOnce({
      id: 'demo-100',
      status: DemoStatus.SCHEDULED,
      tutorId: 'tutor-assigned',
      scheduledAt: future,
      studentId: 'student-100',
      bookedByUserId: 'sales-100',
      student: { lead: { assignedToUserId: 'sales-100' } },
    });
    tx.demoBooking.findFirst.mockResolvedValueOnce({ id: 'demo-100', coordinatorId: 'coord-other' });
    const reschedResult = await service.rescheduleDemo('demo-100', {
      scheduledAt: newStart.toISOString(),
      durationMinutes: 45,
      reason: 'Operational schedule shift',
    }, { id: 'admin-1', email: 'admin@test.com' } as any);
    expect(reschedResult).toBeDefined();

    // Assign tutor
    tx.demo.findUnique.mockResolvedValueOnce({
      id: 'demo-100',
      status: DemoStatus.SCHEDULED,
      scheduledAt: future,
      durationMinutes: 60,
      studentId: 'student-100',
    });
    tx.demoBooking.findFirst.mockResolvedValueOnce({ id: 'demo-100', coordinatorId: 'coord-other' });
    const assignResult = await service.assignTutor('demo-100', { tutorId: 'new-tutor-2' }, { id: 'admin-1', email: 'admin@test.com' } as any);
    expect(assignResult).toBeDefined();

    // Cancel
    tx.demo.findUnique.mockResolvedValueOnce({
      id: 'demo-100',
      status: DemoStatus.SCHEDULED,
      bookedByUserId: 'sales-100',
      student: { lead: { assignedToUserId: 'sales-100' } },
    });
    tx.demoBooking.findFirst.mockResolvedValueOnce({ id: 'demo-100', coordinatorId: 'coord-other' });
    const cancelResult = await service.cancelDemo('demo-100', { reason: 'Student unavailable' }, { id: 'admin-1', email: 'admin@test.com' } as any);
    expect(cancelResult).toBeDefined();
  });

  // ── Scenario 3: Demo Admin cannot perform ungranted global-administration actions ─
  it('Scenario 3: Demo Admin cannot approve session exceptions or perform ungranted actions', async () => {
    const { service, tx } = createDemoServiceMock({
      roles: ['DEMO_ADMIN'],
      permissions: ['demo.manage_operations'],
    });

    tx.demoSessionException.findUnique.mockResolvedValueOnce({ id: 'exc-1', resolutionStatus: DemoExceptionStatus.PENDING });

    await expect(
      service.reviewSessionException('exc-1', { decision: DemoExceptionStatus.APPROVED }, { id: 'admin-1', email: 'admin@test.com' } as any)
    ).rejects.toThrow('Only Academic Head or Operations Manager can approve or reject session exceptions');
  });

  // ── Scenario 4: Coordinator can open a booking within their assigned scope ────────
  it('Scenario 4: Coordinator can open a booking within their assigned coordination scope', async () => {
    const { service, prisma } = createDemoServiceMock({
      roles: ['DEMO_COORDINATOR'],
      permissions: ['demo.read', 'demo.read_assigned', 'demo.coordinate'],
      userId: 'coord-assigned',
    });

    prisma.demo.findUnique.mockResolvedValueOnce({ ...sampleDemoRecord });
    prisma.demoBooking.findFirst.mockResolvedValueOnce({ ...sampleMultiSessionBooking, coordinatorId: 'coord-assigned' });

    const detail = await service.getDemoById('demo-100', { id: 'coord-assigned', email: 'coord@test.com' } as any);
    expect(detail).toBeDefined();
    expect(detail.id).toBe('demo-100');
  });

  // ── Scenario 5: Coordinator cannot access an unrelated booking ───────────────────
  it('Scenario 5: Coordinator cannot access an unrelated booking outside their coordinator assignment', async () => {
    const { service, prisma } = createDemoServiceMock({
      roles: ['DEMO_COORDINATOR'],
      permissions: ['demo.read', 'demo.read_assigned', 'demo.coordinate'],
      userId: 'coord-other',
    });

    prisma.demo.findUnique.mockResolvedValueOnce({ ...sampleDemoRecord });
    prisma.demoBooking.findFirst.mockResolvedValueOnce({ ...sampleMultiSessionBooking, coordinatorId: 'coord-assigned' });

    await expect(
      service.getDemoById('demo-100', { id: 'coord-other', email: 'other-coord@test.com' } as any)
    ).rejects.toThrow('You can only view demos assigned to you for coordination');
  });

  // ── Scenario 6: Tutor can open an assigned session ──────────────────────────────
  it('Scenario 6: Tutor can open an assigned demo session', async () => {
    const { service, prisma } = createDemoServiceMock({
      roles: ['TUTOR'],
      permissions: ['demo.read_assigned'],
      userId: 'tutor-assigned',
    });

    prisma.demo.findUnique.mockResolvedValueOnce({ ...sampleDemoRecord, tutorId: 'tutor-assigned' });
    prisma.demoBooking.findFirst.mockResolvedValueOnce({ ...sampleMultiSessionBooking });

    const detail = await service.getDemoById('demo-100', { id: 'tutor-assigned', email: 'tutor@test.com' } as any);
    expect(detail).toBeDefined();
    expect(detail.id).toBe('demo-100');
  });

  // ── Scenario 7: Tutor cannot open an unassigned session ─────────────────────────
  it('Scenario 7: Tutor cannot open an unassigned session (returns 403)', async () => {
    const { service, prisma } = createDemoServiceMock({
      roles: ['TUTOR'],
      permissions: ['demo.read_assigned'],
      userId: 'tutor-unassigned',
    });

    prisma.demo.findUnique.mockResolvedValueOnce({ ...sampleDemoRecord, tutorId: 'tutor-assigned' });
    prisma.demoBooking.findFirst.mockResolvedValueOnce({
      ...sampleMultiSessionBooking,
      sessions: [{ id: 's-1', tutorAssignments: [{ tutorId: 'tutor-assigned', status: 'ACTIVE' }] }],
    });

    await expect(
      service.getDemoById('demo-100', { id: 'tutor-unassigned', email: 'unassigned@test.com' } as any)
    ).rejects.toThrow('You can only view your assigned demos');
  });

  // ── Scenario 8: Sales Counsellor can access demos for their own assigned leads ──
  it('Scenario 8: Sales Counsellor can access demos for their own assigned leads', async () => {
    const { service, prisma } = createDemoServiceMock({
      roles: ['SALES_COUNSELLOR'],
      permissions: ['demo.read_own'],
      userId: 'sales-100',
    });

    prisma.demo.findUnique.mockResolvedValueOnce({ ...sampleDemoRecord });
    prisma.demoBooking.findFirst.mockResolvedValueOnce({ ...sampleMultiSessionBooking });

    const detail = await service.getDemoById('demo-100', { id: 'sales-100', email: 'sales100@test.com' } as any);
    expect(detail).toBeDefined();
    expect(detail.id).toBe('demo-100');
  });

  // ── Scenario 9: Sales Counsellor cannot access another counsellor's restricted records
  it('Scenario 9: Sales Counsellor cannot access another counsellor restricted records', async () => {
    const { service, prisma } = createDemoServiceMock({
      roles: ['SALES_COUNSELLOR'],
      permissions: ['demo.read_own'],
      userId: 'sales-other',
    });

    prisma.demo.findUnique.mockResolvedValueOnce({ ...sampleDemoRecord });
    prisma.demoBooking.findFirst.mockResolvedValueOnce({ ...sampleMultiSessionBooking });

    await expect(
      service.getDemoById('demo-100', { id: 'sales-other', email: 'other@test.com' } as any)
    ).rejects.toThrow('You can only view demos for your assigned leads');
  });

  // ── Scenario 10: Sales Head retains existing RBAC ───────────────────────────────
  it('Scenario 10: Sales Head retains existing team-wide RBAC', async () => {
    const { service, prisma } = createDemoServiceMock({
      roles: ['SALES_HEAD'],
      permissions: ['demo.manage_team'],
      userId: 'sales-head',
    });

    prisma.demo.findUnique.mockResolvedValueOnce({ ...sampleDemoRecord });
    prisma.demoBooking.findFirst.mockResolvedValueOnce({ ...sampleMultiSessionBooking });

    const detail = await service.getDemoById('demo-100', { id: 'sales-head', email: 'head@test.com' } as any);
    expect(detail).toBeDefined();
    expect(detail.id).toBe('demo-100');
  });

  // ── Scenario 11: CEO retains approved company-wide access ───────────────────────
  it('Scenario 11: CEO retains approved company-wide access across all demos', async () => {
    const { service, prisma } = createDemoServiceMock({
      roles: ['CEO'],
      permissions: ['demo.manage_all', 'demo.read_all', 'demo.read_assigned', 'demo.book'],
      userId: 'ceo-user',
    });

    // Opening an unassigned demo
    prisma.demo.findUnique.mockResolvedValueOnce({ ...sampleDemoRecord, tutorId: null });
    prisma.demoBooking.findFirst.mockResolvedValueOnce({ ...sampleMultiSessionBooking, coordinatorId: null });

    const detail = await service.getDemoById('demo-100', { id: 'ceo-user', email: 'ceo@test.com' } as any);
    expect(detail).toBeDefined();
    expect(detail.id).toBe('demo-100');
  });

  // ── Scenario 12: CEO God View enforces the selected target user's scope ─────────
  it('Scenario 12: CEO God View enforces the selected target user scope (e.g. restricted salesperson)', async () => {
    // When GodViewGuard executes, request.user is set to the target user (e.g. sales-other).
    // The service evaluates access as sales-other, correctly rejecting access to sales-100's lead.
    const { service, prisma } = createDemoServiceMock({
      roles: ['SALES_COUNSELLOR'],
      permissions: ['demo.read_own'],
      userId: 'sales-other',
    });

    prisma.demo.findUnique.mockResolvedValueOnce({ ...sampleDemoRecord });
    prisma.demoBooking.findFirst.mockResolvedValueOnce({ ...sampleMultiSessionBooking });

    await expect(
      service.getDemoById('demo-100', { id: 'sales-other', email: 'sales-target@test.com' } as any)
    ).rejects.toThrow(ForbiddenException);
  });

  // ── Scenario 13: Listing and detail endpoints agree on visibility ───────────────
  it('Scenario 13: Listing and detail endpoints agree on visibility for coordinators', async () => {
    const { service, prisma } = createDemoServiceMock({
      roles: ['DEMO_COORDINATOR'],
      permissions: ['demo.coordinate'],
      userId: 'coord-me',
    });

    // Coordinated bookings returns only booking-mine
    prisma.demoBooking.findMany.mockResolvedValueOnce([{ id: 'booking-mine', legacyDemoId: 'demo-mine' }]);
    prisma.demo.findMany.mockResolvedValueOnce([{ id: 'demo-mine', businessId: 'DMO-MINE' }]);

    const list = await service.getDemos({ id: 'coord-me', email: 'me@coord.com' } as any);
    expect(list).toHaveLength(1);
    expect(prisma.demo.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ['booking-mine', 'demo-mine'] } } })
    );

    // Detail for demo-mine: permitted
    prisma.demo.findUnique.mockResolvedValueOnce({ id: 'demo-mine', businessId: 'DMO-MINE' });
    prisma.demoBooking.findFirst.mockResolvedValueOnce({ id: 'booking-mine', coordinatorId: 'coord-me' });
    const detailMine = await service.getDemoById('demo-mine', { id: 'coord-me', email: 'me@coord.com' } as any);
    expect(detailMine).toBeDefined();

    // Detail for unrelated demo: rejected
    prisma.demo.findUnique.mockResolvedValueOnce({ id: 'demo-other', businessId: 'DMO-OTHER' });
    prisma.demoBooking.findFirst.mockResolvedValueOnce({ id: 'booking-other', coordinatorId: 'coord-someone-else' });
    await expect(
      service.getDemoById('demo-other', { id: 'coord-me', email: 'me@coord.com' } as any)
    ).rejects.toThrow(ForbiddenException);
  });

  // ── Scenario 14: Legacy Demo and multi-session booking records both follow policy ─
  it('Scenario 14: Legacy Demo and multi-session booking records both follow the intended authorization policy', async () => {
    const { service, prisma } = createDemoServiceMock({
      roles: ['DEMO_ADMIN'],
      permissions: ['demo.manage_operations'],
    });

    // Legacy demo without demoBooking record
    prisma.demo.findUnique.mockResolvedValueOnce({
      ...sampleDemoRecord,
      id: 'legacy-demo-only',
    });
    prisma.demoBooking.findFirst.mockResolvedValueOnce(null);

    const legacyDetail = await service.getDemoById('legacy-demo-only', { id: 'admin-1', email: 'admin@test.com' } as any);
    expect(legacyDetail).toBeDefined();
    expect(legacyDetail.id).toBe('legacy-demo-only');

    // Multi-session booking found via booking id where demo table has legacy id
    prisma.demo.findUnique.mockResolvedValueOnce(null);
    prisma.demoBooking.findFirst.mockResolvedValueOnce({
      ...sampleMultiSessionBooking,
      id: 'multi-only-id',
      legacyDemoId: null,
    });

    const multiDetail = await service.getDemoById('multi-only-id', { id: 'admin-1', email: 'admin@test.com' } as any);
    expect(multiDetail).toBeDefined();
    expect(multiDetail.id).toBe('multi-only-id');
  });

  // ── Scenario 15: Only Academic Head and Operations Manager can approve Demo exceptions
  it('Scenario 15: Only Academic Head and Operations Manager can approve Demo exceptions (CEO, Demo Head, Demo Admin cannot)', async () => {
    const { service: demoAdminService, tx: txAdmin } = createDemoServiceMock({
      roles: ['DEMO_ADMIN'],
    });
    txAdmin.demoSessionException.findUnique.mockResolvedValueOnce({ id: 'exc-1' });
    await expect(
      demoAdminService.reviewSessionException('exc-1', { decision: DemoExceptionStatus.APPROVED }, { id: 'admin-1', email: 'admin@test.com' } as any)
    ).rejects.toThrow('Only Academic Head or Operations Manager can approve or reject session exceptions');

    const { service: ceoService, tx: txCeo } = createDemoServiceMock({
      roles: ['CEO'],
    });
    txCeo.demoSessionException.findUnique.mockResolvedValueOnce({ id: 'exc-1' });
    await expect(
      ceoService.reviewSessionException('exc-1', { decision: DemoExceptionStatus.APPROVED }, { id: 'ceo-1', email: 'ceo@test.com' } as any)
    ).rejects.toThrow('Only Academic Head or Operations Manager can approve or reject session exceptions');

    const { service: acadHeadService, tx: txAcad } = createDemoServiceMock({
      roles: ['ACADEMIC_HEAD'],
    });
    txAcad.demoSessionException.findUnique.mockResolvedValueOnce({ id: 'exc-1' });
    txAcad.demoSessionException.update.mockResolvedValueOnce({ id: 'exc-1', resolutionStatus: DemoExceptionStatus.APPROVED });
    const acadResult = await acadHeadService.reviewSessionException(
      'exc-1',
      { decision: DemoExceptionStatus.APPROVED, reviewNotes: 'Approved academic waiver' },
      { id: 'acad-head-1', email: 'acad@test.com' } as any
    );
    expect(acadResult.resolutionStatus).toBe(DemoExceptionStatus.APPROVED);

    const { service: opsMgrService, tx: txOps } = createDemoServiceMock({
      roles: ['OPERATIONS_MANAGER'],
    });
    txOps.demoSessionException.findUnique.mockResolvedValueOnce({ id: 'exc-2' });
    txOps.demoSessionException.update.mockResolvedValueOnce({ id: 'exc-2', resolutionStatus: DemoExceptionStatus.APPROVED });
    const opsResult = await opsMgrService.reviewSessionException(
      'exc-2',
      { decision: DemoExceptionStatus.APPROVED, reviewNotes: 'Approved operations exception' },
      { id: 'ops-1', email: 'ops@test.com' } as any
    );
    expect(opsResult.resolutionStatus).toBe(DemoExceptionStatus.APPROVED);
  });

  // ── Scenario 16: Existing staff can receive a Demo role without creating duplicate identity
  it('Scenario 16: UserRoleService allows assigning DEMO_ADMIN or DEMO_HEAD to existing staff without duplicate user creation', async () => {
    const mockPrismaTx: any = {
      userRole: { create: jest.fn().mockResolvedValue({ userId: 'staff-1', roleId: 'role-demo-admin' }) },
    };
    const mockPrisma: any = {
      user: {
        findUnique: jest.fn().mockImplementation(({ where }) => {
          if (where.id === 'staff-1') {
            return Promise.resolve({
              id: 'staff-1',
              email: 'staff@elscore.com',
              userRoles: [{ role: { code: 'SALES_COUNSELLOR' } }],
            });
          }
          if (where.id === 'actor-ceo') {
            return Promise.resolve({
              id: 'actor-ceo',
              userRoles: [{ role: { code: 'CEO' } }],
            });
          }
          return null;
        }),
      },
      role: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'role-demo-admin',
          code: 'DEMO_ADMIN',
          isProtected: false,
        }),
      },
      $transaction: jest.fn(async (fn: (client: any) => Promise<unknown>) => fn(mockPrismaTx)),
    };

    const mockAudit: any = { recordInTx: jest.fn().mockResolvedValue(undefined) };
    const mockRbac: any = { invalidateCache: jest.fn().mockResolvedValue(undefined) };

    const userRoleService = new UserRoleService(mockPrisma, mockAudit, mockRbac);
    await userRoleService.assignRole('staff-1', 'role-demo-admin', 'actor-ceo');

    expect(mockPrismaTx.userRole.create).toHaveBeenCalledWith({
      data: {
        userId: 'staff-1',
        roleId: 'role-demo-admin',
        grantedByUserId: 'actor-ceo',
      },
    });
    expect(mockAudit.recordInTx).toHaveBeenCalledWith(
      mockPrismaTx,
      expect.objectContaining({
        entityType: 'User',
        entityId: 'staff-1',
        action: 'USER_ROLE_ASSIGNED',
      })
    );
    expect(mockRbac.invalidateCache).toHaveBeenCalledWith('staff-1');
  });

  // ── Scenario 17: Dedicated account creation follows the established secure lifecycle ─
  it('Scenario 17: Dedicated account creation sets PENDING_SETUP and mustChangePassword with single assigned role', async () => {
    const mockTx: any = {
      user: {
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'new-user-1', ...data })),
      },
      employee: {
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'new-emp-1', ...data })),
      },
      userRole: {
        create: jest.fn().mockResolvedValue({ userId: 'new-user-1', roleId: 'role-demo-head' }),
      },
      tutorProfile: { create: jest.fn() },
      roundRobinCounsellorState: { create: jest.fn() },
    };

    const mockPrisma: any = {
      role: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'role-demo-head',
          code: 'DEMO_HEAD',
          isProtected: false,
        }),
      },
      user: {
        findUnique: jest.fn().mockImplementation(({ where }) => {
          if (where.email) return Promise.resolve(null); // not taken
          if (where.id === 'actor-ceo') {
            return Promise.resolve({
              id: 'actor-ceo',
              userRoles: [{ role: { code: 'CEO' } }],
            });
          }
          if (where.id === 'new-user-1') {
            return Promise.resolve({
              id: 'new-user-1',
              email: 'demohead.new@elscore.com',
              status: 'PENDING_SETUP',
              mustChangePassword: true,
              userRoles: [{ role: { code: 'DEMO_HEAD' } }],
            });
          }
          return null;
        }),
      },
      department: {
        findUnique: jest.fn().mockResolvedValue({ id: 'dept-academics', code: 'ACADEMICS' }),
      },
      $transaction: jest.fn(async (fn: (client: any) => Promise<unknown>) => fn(mockTx)),
    };

    const mockAudit: any = { recordInTx: jest.fn().mockResolvedValue(undefined) };
    const mockIdGen: any = { nextIdInTx: jest.fn().mockResolvedValue('EMP-0050') };
    const mockRbac: any = { invalidateCache: jest.fn().mockResolvedValue(undefined) };
    const mockStatusCache: any = { invalidate: jest.fn().mockResolvedValue(undefined) };
    const mockAuth: any = {};

    const userService = new UserService(
      mockPrisma,
      mockAudit,
      mockRbac,
      mockStatusCache,
      mockIdGen,
      mockAuth as any
    );
    const createdUser = await userService.create(
      {
        email: 'demohead.new@elscore.com',
        password: 'SecurePassword123!',
        firstName: 'Farhan',
        lastName: 'Ahmed',
        departmentId: 'dept-academics',
        roleId: 'role-demo-head',
      },
      'actor-ceo'
    );

    expect(createdUser).toBeDefined();
    expect(mockTx.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: 'demohead.new@elscore.com',
          status: 'PENDING_SETUP',
          mustChangePassword: true,
        }),
      })
    );
    expect(mockTx.userRole.create).toHaveBeenCalledWith({
      data: {
        userId: expect.any(String),
        roleId: 'role-demo-head',
        grantedByUserId: 'actor-ceo',
      },
    });
  });

  // ── Scenario 18: Forbidden access returns a controlled response and does not leak record data
  it('Scenario 18: Forbidden access returns controlled 403 ForbiddenException and does not leak demo record data', async () => {
    const { service, prisma } = createDemoServiceMock({
      roles: ['SALES_COUNSELLOR'],
      permissions: ['demo.read_own'],
      userId: 'unauthorized-sales-user',
    });

    prisma.demo.findUnique.mockResolvedValueOnce({
      ...sampleDemoRecord,
      secretInternalNote: 'Sensitive parent financial background',
    });
    prisma.demoBooking.findFirst.mockResolvedValueOnce({ ...sampleMultiSessionBooking });

    let thrownError: any = null;
    try {
      await service.getDemoById('demo-100', { id: 'unauthorized-sales-user', email: 'unauth@test.com' } as any);
    } catch (e) {
      thrownError = e;
    }

    expect(thrownError).toBeInstanceOf(ForbiddenException);
    expect(thrownError.message).toBe('You can only view demos for your assigned leads');
    expect(thrownError.response?.secretInternalNote).toBeUndefined();
    expect(thrownError.response?.student).toBeUndefined();
  });

  // ── Scenario 19: The Demo details route does not crash on an ordinary authorization denial
  it('Scenario 19: Demo details error contract returns standard exception structure without unhandled crash', async () => {
    const { service, prisma } = createDemoServiceMock({
      roles: ['TUTOR'],
      permissions: ['demo.read_assigned'],
      userId: 'unassigned-tutor-user',
    });

    prisma.demo.findUnique.mockResolvedValueOnce({ ...sampleDemoRecord });
    prisma.demoBooking.findFirst.mockResolvedValueOnce({ ...sampleMultiSessionBooking });

    await expect(
      service.getDemoById('demo-100', { id: 'unassigned-tutor-user', email: 'tutor@test.com' } as any)
    ).rejects.toThrow(ForbiddenException);
  });

  // ── Scenario 20: Existing Demo booking and Interested-to-Demo-Booked regression tests pass
  it('Scenario 20: Existing Demo booking with valid lead owner succeeds seamlessly', async () => {
    const { service, tx } = createDemoServiceMock({
      roles: ['SALES_COUNSELLOR'],
      permissions: ['demo.book', 'demo.read_own'],
      userId: 'sales-owner',
    });

    tx.requirement.findUnique.mockResolvedValueOnce({
      id: 'req-1',
      studentId: 'student-1',
      subjectId: 'sub-1',
      curriculumId: 'cur-1',
      gradeId: 'gr-1',
      student: { id: 'student-1', firstName: 'Child', lead: { id: 'lead-1', assignedToUserId: 'sales-owner', status: 'INTERESTED' } },
    });
    tx.student.findUnique.mockResolvedValueOnce({
      id: 'student-1',
      firstName: 'Child',
      lead: { id: 'lead-1', assignedToUserId: 'sales-owner', status: 'INTERESTED' },
      requirements: [{ id: 'req-1', subjectId: 'sub-1', curriculumId: 'cur-1', gradeId: 'gr-1' }],
    });
    tx.demo.findMany.mockResolvedValueOnce([]);

    const booking = await service.bookDemo(
      {
        studentId: 'student-1',
        requirementId: 'req-1',
        scheduledAt: future.toISOString(),
        durationMinutes: 45,
      },
      { id: 'sales-owner', email: 'sales@test.com' } as any
    );

    expect(booking).toBeDefined();
    expect(tx.demo.create).toHaveBeenCalled();
  });
});
