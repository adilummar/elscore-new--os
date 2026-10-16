import { DemoStatus } from '@prisma/client';
import { DemoBackfillService } from './demo-backfill.service';

describe('DemoBackfillService', () => {
  let service: DemoBackfillService;

  beforeEach(() => {
    service = new DemoBackfillService();
  });

  describe('Deterministic ID Generation', () => {
    it('produces identical deterministic UUIDs on multiple invocations', () => {
      const legacyDemoId = 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d';
      const legacyRescheduleId = 'b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e';

      const bookingId1 = service.generateDeterministicBookingId(legacyDemoId);
      const bookingId2 = service.generateDeterministicBookingId(legacyDemoId);
      expect(bookingId1).toBe(legacyDemoId);
      expect(bookingId1).toBe(bookingId2);

      const sessionId1 = service.generateDeterministicSessionId(legacyDemoId, 1);
      const sessionId2 = service.generateDeterministicSessionId(legacyDemoId, 1);
      expect(sessionId1).toBe(sessionId2);
      expect(sessionId1).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

      const assignmentId1 = service.generateDeterministicAssignmentId(legacyDemoId, 1);
      const assignmentId2 = service.generateDeterministicAssignmentId(legacyDemoId, 1);
      expect(assignmentId1).toBe(assignmentId2);

      const feedbackId1 = service.generateDeterministicFeedbackId(legacyDemoId);
      const feedbackId2 = service.generateDeterministicFeedbackId(legacyDemoId);
      expect(feedbackId1).toBe(feedbackId2);

      const rescheduleId1 = service.generateDeterministicRescheduleId(legacyRescheduleId);
      const rescheduleId2 = service.generateDeterministicRescheduleId(legacyRescheduleId);
      expect(rescheduleId1).toBe(rescheduleId2);
    });

    it('produces distinct deterministic IDs for different session orders and entities', () => {
      const demoId = 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d';
      const session1 = service.generateDeterministicSessionId(demoId, 1);
      const session2 = service.generateDeterministicSessionId(demoId, 2);
      const assignment = service.generateDeterministicAssignmentId(demoId, 1);
      const feedback = service.generateDeterministicFeedbackId(demoId);

      expect(session1).not.toBe(session2);
      expect(session1).not.toBe(assignment);
      expect(session1).not.toBe(feedback);
    });
  });

  describe('Preflight Validation & Orphan Detection', () => {
    const mockStudent = { id: 'student-1', leadId: 'lead-1' };
    const mockLead = { id: 'lead-1' };
    const mockRequirement = { id: 'req-1' };
    const mockSubject = { id: 'subj-1' };
    const mockCurriculum = { id: 'curr-1' };
    const mockGrade = { id: 'grade-1' };
    const mockUser = { id: 'user-counsellor' };
    const mockTutor = { id: 'user-tutor' };

    const validDemo = {
      id: 'demo-valid-1',
      businessId: 'DEMO-2026-001',
      studentId: 'student-1',
      requirementId: 'req-1',
      subjectId: 'subj-1',
      curriculumId: 'curr-1',
      gradeId: 'grade-1',
      bookedByUserId: 'user-counsellor',
      tutorId: 'user-tutor',
      status: DemoStatus.SCHEDULED,
      scheduledAt: new Date('2026-10-20T10:00:00Z'),
      durationMinutes: 45,
    };

    const buildLookups = (overrides: Partial<any> = {}) => ({
      students: new Map([[mockStudent.id, mockStudent]]),
      leads: new Map([[mockLead.id, mockLead]]),
      requirements: new Map([[mockRequirement.id, mockRequirement]]),
      subjects: new Map([[mockSubject.id, mockSubject]]),
      curricula: new Map([[mockCurriculum.id, mockCurriculum]]),
      grades: new Map([[mockGrade.id, mockGrade]]),
      users: new Map([
        [mockUser.id, mockUser],
        [mockTutor.id, mockTutor],
      ]),
      ...overrides,
    });

    it('passes validation for fully referenced legacy demo', () => {
      const lookups = buildLookups();
      const existingBookings = new Map();

      const result = service.validatePreflight([validDemo], existingBookings, lookups);
      expect(result.eligibleDemos.length).toBe(1);
      expect(result.orphans.length).toBe(0);
      expect(result.conflicts.length).toBe(0);
      expect(result.eligibleDemos[0].resolvedLeadId).toBe('lead-1');
    });

    it('detects orphaned demo with missing student', () => {
      const lookups = buildLookups({ students: new Map() });
      const result = service.validatePreflight([validDemo], new Map(), lookups);

      expect(result.eligibleDemos.length).toBe(0);
      expect(result.orphans.length).toBe(1);
      expect(result.orphans[0].reason).toBe('MISSING_STUDENT');
      expect(result.orphans[0].missingReferenceId).toBe('student-1');
    });

    it('detects orphaned demo with student missing parent lead', () => {
      const lookups = buildLookups({ leads: new Map() });
      const result = service.validatePreflight([validDemo], new Map(), lookups);

      expect(result.eligibleDemos.length).toBe(0);
      expect(result.orphans.length).toBe(1);
      expect(result.orphans[0].reason).toBe('MISSING_LEAD');
      expect(result.orphans[0].missingReferenceId).toBe('lead-1');
    });

    it('detects orphaned demo with missing requirement or subject', () => {
      const lookupsReqMissing = buildLookups({ requirements: new Map() });
      const result1 = service.validatePreflight([validDemo], new Map(), lookupsReqMissing);
      expect(result1.orphans[0].reason).toBe('MISSING_REQUIREMENT');

      const lookupsSubjMissing = buildLookups({ subjects: new Map() });
      const result2 = service.validatePreflight([validDemo], new Map(), lookupsSubjMissing);
      expect(result2.orphans[0].reason).toBe('MISSING_SUBJECT');
    });

    it('detects orphaned demo with missing assigned tutor', () => {
      const lookupsTutorMissing = buildLookups({
        users: new Map([[mockUser.id, mockUser]]), // tutor omitted
      });
      const result = service.validatePreflight([validDemo], new Map(), lookupsTutorMissing);
      expect(result.orphans.length).toBe(1);
      expect(result.orphans[0].reason).toBe('MISSING_TUTOR');
      expect(result.orphans[0].missingReferenceId).toBe('user-tutor');
    });
  });

  describe('Rerun Idempotency & Conflict Detection', () => {
    const mockStudent = { id: 'student-1', leadId: 'lead-1' };
    const mockLead = { id: 'lead-1' };
    const mockRequirement = { id: 'req-1' };
    const mockSubject = { id: 'subj-1' };
    const mockCurriculum = { id: 'curr-1' };
    const mockGrade = { id: 'grade-1' };
    const mockUser = { id: 'user-counsellor' };

    const demo = {
      id: 'demo-100',
      businessId: 'DEMO-2026-100',
      studentId: 'student-1',
      requirementId: 'req-1',
      subjectId: 'subj-1',
      curriculumId: 'curr-1',
      gradeId: 'grade-1',
      bookedByUserId: 'user-counsellor',
      tutorId: null,
      status: DemoStatus.SCHEDULED,
      scheduledAt: new Date('2026-10-25T14:00:00Z'),
      durationMinutes: 60,
    };

    const lookups = {
      students: new Map([[mockStudent.id, mockStudent]]),
      leads: new Map([[mockLead.id, mockLead]]),
      requirements: new Map([[mockRequirement.id, mockRequirement]]),
      subjects: new Map([[mockSubject.id, mockSubject]]),
      curricula: new Map([[mockCurriculum.id, mockCurriculum]]),
      grades: new Map([[mockGrade.id, mockGrade]]),
      users: new Map([[mockUser.id, mockUser]]),
    };

    it('correctly marks already backfilled demo on rerun without errors or conflicts', () => {
      const existingMatchingBooking = {
        id: 'demo-100',
        legacyDemoId: 'demo-100',
        businessId: 'DEMO-2026-100',
        studentId: 'student-1',
        leadId: 'lead-1',
        scheduledDate: new Date('2026-10-25T14:00:00Z'),
      };

      const existingMap = new Map([['demo-100', existingMatchingBooking]]);
      const result = service.validatePreflight([demo], existingMap, lookups);

      expect(result.conflicts.length).toBe(0);
      expect(result.alreadyBackfilledIds.has('demo-100')).toBe(true);
      expect(result.eligibleDemos.length).toBe(1);
    });

    it('detects businessId collision when another booking occupies the businessId', () => {
      const collidingBooking = {
        id: 'booking-unrelated-555',
        businessId: 'DEMO-2026-100', // Collides with demo.businessId
        legacyDemoId: 'demo-different-999',
      };

      const maps = {
        byLegacyId: new Map(),
        byBusinessId: new Map([['DEMO-2026-100', collidingBooking]]),
        byId: new Map(),
      };

      const result = service.validatePreflight([demo], maps, lookups);
      expect(result.conflicts.length).toBe(1);
      expect(result.conflicts[0].demoId).toBe('demo-100');
      expect(result.conflicts[0].mismatches[0].field).toBe('businessId');
      expect(result.conflicts[0].mismatches[0].existingBookingValue).toContain('booking-unrelated-555');
    });

    it('detects primary key collision when another booking occupies the demo id', () => {
      const collidingBooking = {
        id: 'demo-100', // Collides with demo.id
        businessId: 'DEMO-OTHER',
        legacyDemoId: 'demo-other-888',
      };

      const maps = {
        byLegacyId: new Map(),
        byBusinessId: new Map(),
        byId: new Map([['demo-100', collidingBooking]]),
      };

      const result = service.validatePreflight([demo], maps, lookups);
      expect(result.conflicts.length).toBe(1);
      expect(result.conflicts[0].demoId).toBe('demo-100');
      expect(result.conflicts[0].mismatches[0].field).toBe('id');
      expect(result.conflicts[0].mismatches[0].existingBookingValue).toContain('demo-100');
    });

    it('proves runBackfill halts immediately on conflict and returns HALTED_CONFLICTS status without inserts', async () => {
      const mockPrisma = {
        demo: {
          findMany: jest.fn().mockResolvedValue([demo]),
        },
        demoBooking: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'booking-diff-999',
              legacyDemoId: 'demo-100',
              businessId: 'DEMO-CONFLICT',
              studentId: 'student-different',
              leadId: 'lead-different',
              scheduledDate: new Date('2026-10-25T14:00:00Z'),
            },
          ]),
          create: jest.fn(),
        },
        student: { findMany: jest.fn().mockResolvedValue([mockStudent]) },
        lead: { findMany: jest.fn().mockResolvedValue([mockLead]) },
        requirement: { findMany: jest.fn().mockResolvedValue([mockRequirement]) },
        subject: { findMany: jest.fn().mockResolvedValue([mockSubject]) },
        curriculum: { findMany: jest.fn().mockResolvedValue([mockCurriculum]) },
        grade: { findMany: jest.fn().mockResolvedValue([mockGrade]) },
        user: { findMany: jest.fn().mockResolvedValue([mockUser]) },
        $transaction: jest.fn(),
      };

      const backfillWithPrisma = new DemoBackfillService(mockPrisma as any);
      const report = await backfillWithPrisma.runBackfill({ dryRun: false });

      expect(report.status).toBe('HALTED_CONFLICTS');
      expect(report.conflicts.length).toBe(1);
      expect(report.newlyBackfilled).toBe(0);
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
      expect(mockPrisma.demoBooking.create).not.toHaveBeenCalled();
    });
  });
});

