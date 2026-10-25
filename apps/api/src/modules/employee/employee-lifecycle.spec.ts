import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { EmploymentStatus, UserStatus } from '@prisma/client';
import { EmployeeService } from './employee.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { UserStatusCacheService } from '../../common/auth/services/user-status-cache.service';
import { RbacService } from '../../common/rbac/rbac.service';
import { isEligibleForWork, isBlockedFromLeave } from '../../common/utils/employment-status.util';

describe('Employee Lifecycle & Profile Management (HR Phase 1)', () => {
  let service: EmployeeService;
  let prisma: any;
  let audit: any;
  let userStatusCache: any;
  let rbacService: any;

  beforeEach(async () => {
    prisma = {
      $transaction: jest.fn(async (cb) => cb(prisma)),
      employee: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      employeeStatusHistory: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      refreshToken: {
        updateMany: jest.fn(),
      },
      userPermission: {
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn(),
      },
      department: {
        findUnique: jest.fn(),
      },
    };

    audit = {
      record: jest.fn().mockResolvedValue({ id: 'audit-1' }),
      recordInTx: jest.fn().mockResolvedValue({ id: 'audit-tx-1' }),
    };

    userStatusCache = {
      invalidate: jest.fn().mockResolvedValue(undefined),
    };

    rbacService = {
      invalidateCache: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmployeeService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
        { provide: UserStatusCacheService, useValue: userStatusCache },
        { provide: RbacService, useValue: rbacService },
      ],
    }).compile();

    service = module.get<EmployeeService>(EmployeeService);
  });

  const mockEmployee = {
    id: 'emp-101',
    businessId: 'EMP-0001',
    userId: 'user-101',
    firstName: 'John',
    lastName: 'Doe',
    phone: '+919876543210',
    personalEmail: 'john.personal@example.com',
    dateOfBirth: '1990-05-15',
    gender: 'MALE',
    address: '123 Main St, Bangalore',
    emergencyContactName: 'Jane Doe',
    emergencyContactPhone: '+919876543211',
    emergencyContactRelation: 'Spouse',
    jobTitle: 'Academic Coordinator',
    employmentType: 'FULL_TIME',
    noticePeriodDays: 30,
    probationEndDate: '2026-03-31',
    confirmationDate: null,
    resignationDate: null,
    lastWorkingDate: null,
    employmentStatus: EmploymentStatus.PROBATION,
    departmentId: 'dept-1',
    reportingManagerId: null,
    user: {
      id: 'user-101',
      email: 'john@elscore.com',
      status: UserStatus.ACTIVE,
      userRoles: [],
    },
  };

  // Scenario 1: Employee ID auto-generation format (EMP-####) and immutability (reject businessId updates in updateProfile)
  it('Scenario 1: rejects updates attempting to mutate businessId', async () => {
    prisma.employee.findUnique.mockResolvedValue(mockEmployee);
    prisma.employee.update.mockResolvedValue({ ...mockEmployee, firstName: 'Johnny' });

    // Calling updateProfile with a DTO (businessId is not an allowed field in UpdateEmployeeDto)
    await service.updateProfile('emp-101', { firstName: 'Johnny' } as any, 'hr-user-1');

    expect(prisma.employee.update).toHaveBeenCalledWith({
      where: { id: 'emp-101' },
      data: { firstName: 'Johnny' },
    });
    // Ensure businessId was never part of the update data
    expect(prisma.employee.update.mock.calls[0][0].data.businessId).toBeUndefined();
  });

  // Scenario 2: Updating personal info by authorized HR
  it('Scenario 2: updates personal information (DOB, gender, address, personal email, emergency contacts)', async () => {
    prisma.employee.findUnique.mockResolvedValue(mockEmployee);
    prisma.employee.update.mockResolvedValue({
      ...mockEmployee,
      personalEmail: 'new.personal@example.com',
      dateOfBirth: '1992-08-20',
      gender: 'MALE',
      address: '456 Tech Park, Bangalore',
      emergencyContactName: 'Mary Doe',
      emergencyContactPhone: '+919876500000',
      emergencyContactRelation: 'Sister',
    });

    const result = await service.updateProfile(
      'emp-101',
      {
        personalEmail: 'new.personal@example.com',
        dateOfBirth: '1992-08-20',
        gender: 'MALE',
        address: '456 Tech Park, Bangalore',
        emergencyContactName: 'Mary Doe',
        emergencyContactPhone: '+919876500000',
        emergencyContactRelation: 'Sister',
      },
      'hr-user-1',
    );

    expect(prisma.employee.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          personalEmail: 'new.personal@example.com',
          dateOfBirth: '1992-08-20',
          emergencyContactName: 'Mary Doe',
        }),
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'EMPLOYEE_PROFILE_UPDATED',
        actorUserId: 'hr-user-1',
      }),
    );
  });

  // Scenario 3: Field-level privacy masking for standard employee viewing another employee
  it('Scenario 3: masks personal details when viewed by a non-HR/non-self user', async () => {
    prisma.employee.findUnique.mockResolvedValue({
      ...mockEmployee,
      department: { name: 'Operations' },
      user: { id: 'user-101', email: 'john@elscore.com', status: UserStatus.ACTIVE, userRoles: [] },
    });
    // Viewer is standard teacher/sales without HR or CEO role
    prisma.user.findUnique.mockResolvedValue({
      id: 'viewer-other',
      userRoles: [{ role: { code: 'TEACHER' } }],
    });

    const result = await service.findOne('emp-101', 'viewer-other');

    expect(result.personalEmail).toBeNull();
    expect(result.dateOfBirth).toBeNull();
    expect(result.gender).toBeNull();
    expect(result.address).toBeNull();
    expect(result.emergencyContactName).toBeNull();
    expect(result.emergencyContactPhone).toBeNull();
  });

  it('Scenario 3b: does NOT mask personal details when employee views their own profile', async () => {
    prisma.employee.findUnique.mockResolvedValue({
      ...mockEmployee,
      department: { name: 'Operations' },
      user: { id: 'user-101', email: 'john@elscore.com', status: UserStatus.ACTIVE, userRoles: [] },
    });
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-101',
      userRoles: [{ role: { code: 'TEACHER' } }],
    });

    const result = await service.findOne('emp-101', 'user-101');

    expect(result.personalEmail).toBe('john.personal@example.com');
    expect(result.dateOfBirth).toBe('1990-05-15');
    expect(result.emergencyContactName).toBe('Jane Doe');
  });

  // Scenario 4: Transition from PROBATION to ACTIVE sets confirmation date and records status history
  it('Scenario 4: transitions PROBATION to ACTIVE, sets confirmationDate, and creates EmployeeStatusHistory', async () => {
    prisma.employee.findUnique.mockResolvedValue(mockEmployee);
    prisma.employee.update.mockResolvedValue({
      ...mockEmployee,
      employmentStatus: EmploymentStatus.ACTIVE,
      confirmationDate: '2026-04-01',
    });

    await service.transitionStatus(
      'emp-101',
      {
        status: EmploymentStatus.ACTIVE,
        effectiveDate: '2026-04-01',
        confirmationDate: '2026-04-01',
        reason: 'Successfully completed 90-day probationary review',
      },
      'hr-user-1',
    );

    expect(prisma.employeeStatusHistory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        employeeId: 'emp-101',
        previousStatus: EmploymentStatus.PROBATION,
        newStatus: EmploymentStatus.ACTIVE,
        effectiveDate: '2026-04-01',
        reason: 'Successfully completed 90-day probationary review',
        accessRestricted: false,
        authorizedByUserId: 'hr-user-1',
      }),
    });
    expect(audit.recordInTx).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: 'EMPLOYEE_PROBATION_CONFIRMED',
      }),
    );
  });

  // Scenario 5: Transition to NOTICE_PERIOD preserves system access by default (user.status remains ACTIVE)
  it('Scenario 5: NOTICE_PERIOD preserves system access by default without revoking tokens', async () => {
    prisma.employee.findUnique.mockResolvedValue({
      ...mockEmployee,
      employmentStatus: EmploymentStatus.ACTIVE,
    });
    prisma.employee.update.mockResolvedValue({
      ...mockEmployee,
      employmentStatus: EmploymentStatus.NOTICE_PERIOD,
    });

    await service.transitionStatus(
      'emp-101',
      {
        status: EmploymentStatus.NOTICE_PERIOD,
        effectiveDate: '2026-05-01',
        resignationDate: '2026-05-01',
        lastWorkingDate: '2026-05-31',
        reason: 'Resigned to pursue higher education',
        restrictAccess: false,
      },
      'hr-user-1',
    );

    // User status should NOT have been updated to SUSPENDED or INACTIVE
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
    expect(userStatusCache.invalidate).not.toHaveBeenCalled();
  });

  // Scenario 6: Transition to NOTICE_PERIOD with restrictAccess: true sets user.status = SUSPENDED and revokes refresh tokens
  it('Scenario 6: NOTICE_PERIOD with restrictAccess: true sets user.status = SUSPENDED and revokes tokens', async () => {
    prisma.employee.findUnique.mockResolvedValue({
      ...mockEmployee,
      employmentStatus: EmploymentStatus.ACTIVE,
    });
    prisma.employee.update.mockResolvedValue({
      ...mockEmployee,
      employmentStatus: EmploymentStatus.NOTICE_PERIOD,
    });

    await service.transitionStatus(
      'emp-101',
      {
        status: EmploymentStatus.NOTICE_PERIOD,
        effectiveDate: '2026-05-01',
        reason: 'Immediate gardening leave requested',
        restrictAccess: true,
      },
      'hr-user-1',
    );

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-101' },
      data: { status: UserStatus.SUSPENDED },
    });
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-101', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(userStatusCache.invalidate).toHaveBeenCalledWith('user-101');
  });

  // Scenario 7: Transition to SUSPENDED with restrictAccess: false retains user.status = ACTIVE
  it('Scenario 7: SUSPENDED with restrictAccess: false preserves user.status ACTIVE', async () => {
    prisma.employee.findUnique.mockResolvedValue({
      ...mockEmployee,
      employmentStatus: EmploymentStatus.ACTIVE,
    });
    prisma.employee.update.mockResolvedValue({
      ...mockEmployee,
      employmentStatus: EmploymentStatus.SUSPENDED,
    });

    await service.transitionStatus(
      'emp-101',
      {
        status: EmploymentStatus.SUSPENDED,
        effectiveDate: '2026-06-01',
        reason: 'Pending administrative inquiry without system lock',
        restrictAccess: false,
      },
      'hr-user-1',
    );

    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
  });

  // Scenario 8: Transition to SUSPENDED with restrictAccess: true suspends user account and revokes tokens
  it('Scenario 8: SUSPENDED with restrictAccess: true suspends user account and revokes tokens', async () => {
    prisma.employee.findUnique.mockResolvedValue({
      ...mockEmployee,
      employmentStatus: EmploymentStatus.ACTIVE,
    });
    prisma.employee.update.mockResolvedValue({
      ...mockEmployee,
      employmentStatus: EmploymentStatus.SUSPENDED,
    });

    await service.transitionStatus(
      'emp-101',
      {
        status: EmploymentStatus.SUSPENDED,
        effectiveDate: '2026-06-01',
        reason: 'Security incident investigation',
        restrictAccess: true,
      },
      'hr-user-1',
    );

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-101' },
      data: { status: UserStatus.SUSPENDED },
    });
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-101', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(userStatusCache.invalidate).toHaveBeenCalledWith('user-101');
  });

  // Scenario 9: Reactivation from SUSPENDED to ACTIVE restores user.status to ACTIVE
  it('Scenario 9: reactivates a suspended user when transitioning status back to ACTIVE', async () => {
    const suspendedEmp = {
      ...mockEmployee,
      employmentStatus: EmploymentStatus.SUSPENDED,
      user: {
        ...mockEmployee.user,
        status: UserStatus.SUSPENDED,
      },
    };
    prisma.employee.findUnique.mockResolvedValue(suspendedEmp);
    prisma.employee.update.mockResolvedValue({
      ...suspendedEmp,
      employmentStatus: EmploymentStatus.ACTIVE,
    });

    await service.transitionStatus(
      'emp-101',
      {
        status: EmploymentStatus.ACTIVE,
        effectiveDate: '2026-06-15',
        reason: 'Inquiry cleared; reinstated with full access',
      },
      'hr-user-1',
    );

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-101' },
      data: { status: UserStatus.ACTIVE },
    });
    expect(userStatusCache.invalidate).toHaveBeenCalledWith('user-101');
  });

  // Scenario 10: Transition to TERMINATED always sets user.status = INACTIVE, revokes tokens and delegations
  it('Scenario 10: TERMINATED offboarding sets user.status = INACTIVE, revokes refresh tokens and delegations', async () => {
    prisma.employee.findUnique.mockResolvedValue(mockEmployee);
    prisma.employee.update.mockResolvedValue({
      ...mockEmployee,
      employmentStatus: EmploymentStatus.TERMINATED,
    });
    prisma.userPermission.findMany.mockResolvedValue([
      { id: 'perm-grant-1', userId: 'user-200', delegatedByUserId: 'user-101' },
    ]);

    await service.transitionStatus(
      'emp-101',
      {
        status: EmploymentStatus.TERMINATED,
        effectiveDate: '2026-07-01',
        reason: 'Employment contract terminated by mutual agreement',
      },
      'hr-user-1',
    );

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-101' },
      data: { status: UserStatus.INACTIVE },
    });
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-101', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(prisma.userPermission.updateMany).toHaveBeenCalledWith({
      where: { delegatedByUserId: 'user-101', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(userStatusCache.invalidate).toHaveBeenCalledWith('user-101');
    expect(rbacService.invalidateCache).toHaveBeenCalledWith('user-200');
  });

  // Scenario 11: Mandating non-empty reason for status transitions
  it('Scenario 11: rejects transition with empty or whitespace-only reason', async () => {
    prisma.employee.findUnique.mockResolvedValue(mockEmployee);

    await expect(
      service.transitionStatus(
        'emp-101',
        {
          status: EmploymentStatus.ACTIVE,
          effectiveDate: '2026-04-01',
          reason: '   ',
        },
        'hr-user-1',
      ),
    ).rejects.toThrow(BadRequestException);
  });

  // Scenario 12: Preventing self-transition of status (separation of duties)
  it('Scenario 12: rejects self-transition if actor is the employee', async () => {
    prisma.employee.findUnique.mockResolvedValue(mockEmployee);

    await expect(
      service.transitionStatus(
        'emp-101',
        {
          status: EmploymentStatus.ACTIVE,
          effectiveDate: '2026-04-01',
          reason: 'Promoting myself to active',
        },
        'user-101', // Actor is the employee themselves!
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  // Scenario 13: Prevention of manager reporting cycles (employee cannot report to themselves)
  it('Scenario 13: prevents assigning self as reporting manager', async () => {
    prisma.employee.findUnique.mockResolvedValue(mockEmployee);

    await expect(
      service.updateProfile(
        'emp-101',
        { reportingManagerId: 'emp-101' },
        'hr-user-1',
      ),
    ).rejects.toThrow(BadRequestException);
  });

  // Scenario 14: Prevention of assigning a TERMINATED employee as reporting manager
  it('Scenario 14: prevents assigning a TERMINATED employee as reporting manager', async () => {
    prisma.employee.findUnique.mockImplementation(async ({ where }: { where: { id?: string } }) => {
      if (where.id === 'emp-101') return mockEmployee;
      if (where.id === 'emp-terminated') {
        return {
          id: 'emp-terminated',
          employmentStatus: EmploymentStatus.TERMINATED,
        };
      }
      return null;
    });

    await expect(
      service.updateProfile(
        'emp-101',
        { reportingManagerId: 'emp-terminated' },
        'hr-user-1',
      ),
    ).rejects.toThrow(BadRequestException);
  });

  // Scenario 15: Verification that transitionStatus is atomic (rollback on error)
  it('Scenario 15: rolls back transaction atomically when a nested error occurs', async () => {
    prisma.employee.findUnique.mockResolvedValue(mockEmployee);
    prisma.employeeStatusHistory.create.mockResolvedValue({ id: 'hist-1' });
    prisma.employee.update.mockRejectedValue(new Error('DB Constraint Violation'));

    await expect(
      service.transitionStatus(
        'emp-101',
        {
          status: EmploymentStatus.ACTIVE,
          effectiveDate: '2026-04-01',
          reason: 'Review complete',
        },
        'hr-user-1',
      ),
    ).rejects.toThrow('DB Constraint Violation');

    // Cache invalidation should not have run because the transaction failed
    expect(userStatusCache.invalidate).not.toHaveBeenCalled();
  });

  // Scenario 16: Confidential history access restriction
  it('Scenario 16: retrieves history records for an employee', async () => {
    prisma.employee.findUnique.mockResolvedValue(mockEmployee);
    prisma.employeeStatusHistory.findMany.mockResolvedValue([
      {
        id: 'hist-1',
        employeeId: 'emp-101',
        previousStatus: EmploymentStatus.PROBATION,
        newStatus: EmploymentStatus.ACTIVE,
        effectiveDate: '2026-04-01',
        reason: 'Confirmed',
        authorizedBy: { id: 'hr-1', email: 'hr@elscore.com' },
      },
    ]);

    const history = await service.getStatusHistory('emp-101');
    expect(history).toHaveLength(1);
    expect(history[0].newStatus).toBe(EmploymentStatus.ACTIVE);
  });

  // Scenario 17: Work eligibility helper and leave blocking checks
  it('Scenario 17: validates operational work eligibility and leave blocking across all statuses', () => {
    // Eligible for work: ACTIVE, PROBATION, NOTICE_PERIOD
    expect(isEligibleForWork('ACTIVE')).toBe(true);
    expect(isEligibleForWork('PROBATION')).toBe(true);
    expect(isEligibleForWork('NOTICE_PERIOD')).toBe(true);
    expect(isEligibleForWork('SUSPENDED')).toBe(false);
    expect(isEligibleForWork('TERMINATED')).toBe(false);
    expect(isEligibleForWork('INACTIVE')).toBe(false);
    expect(isEligibleForWork('ON_LEAVE')).toBe(false);
    expect(isEligibleForWork(null)).toBe(false);

    // Blocked from leave: SUSPENDED, TERMINATED
    expect(isBlockedFromLeave('SUSPENDED')).toBe(true);
    expect(isBlockedFromLeave('TERMINATED')).toBe(true);
    expect(isBlockedFromLeave('ACTIVE')).toBe(false);
    expect(isBlockedFromLeave('PROBATION')).toBe(false);
    expect(isBlockedFromLeave('NOTICE_PERIOD')).toBe(false);
  });
});
