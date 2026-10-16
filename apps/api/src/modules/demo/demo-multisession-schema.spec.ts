import { 
  DemoBookingStatus, 
  DemoSessionStatus, 
  DemoParticipantType, 
  DemoAttendanceStatus, 
  TutorAssignmentStatus, 
  DemoSessionExceptionCategory, 
  DemoExceptionStatus,
  PrismaClient 
} from '@prisma/client';

describe('Demo Module Multi-Session Schema Verification', () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = new PrismaClient();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('exposes all required multi-session enums with correct values', () => {
    expect(DemoBookingStatus.SCHEDULED).toBe('SCHEDULED');
    expect(DemoBookingStatus.ASSIGNED).toBe('ASSIGNED');
    expect(DemoBookingStatus.IN_PROGRESS).toBe('IN_PROGRESS');
    expect(DemoBookingStatus.COMPLETED).toBe('COMPLETED');
    expect(DemoBookingStatus.NO_SHOW).toBe('NO_SHOW');
    expect(DemoBookingStatus.CANCELLED).toBe('CANCELLED');

    expect(DemoSessionStatus.SCHEDULED).toBe('SCHEDULED');
    expect(DemoSessionStatus.COMPLETED).toBe('COMPLETED');

    expect(DemoParticipantType.PARENT).toBe('PARENT');
    expect(DemoParticipantType.COORDINATOR).toBe('COORDINATOR');
    expect(DemoParticipantType.TUTOR).toBe('TUTOR');

    expect(DemoAttendanceStatus.PRESENT).toBe('PRESENT');
    expect(DemoAttendanceStatus.ABSENT).toBe('ABSENT');
    expect(DemoAttendanceStatus.LATE).toBe('LATE');

    expect(TutorAssignmentStatus.ACTIVE).toBe('ACTIVE');
    expect(TutorAssignmentStatus.REPLACED).toBe('REPLACED');
    expect(TutorAssignmentStatus.CANCELLED).toBe('CANCELLED');

    expect(DemoSessionExceptionCategory.WAIVER).toBe('WAIVER');
    expect(DemoSessionExceptionCategory.REPLACEMENT_SCHEDULED).toBe('REPLACEMENT_SCHEDULED');
    expect(DemoSessionExceptionCategory.PARENT_DECLINED_SUBJECT).toBe('PARENT_DECLINED_SUBJECT');

    expect(DemoExceptionStatus.PENDING).toBe('PENDING');
    expect(DemoExceptionStatus.APPROVED).toBe('APPROVED');
    expect(DemoExceptionStatus.REJECTED).toBe('REJECTED');
  });

  it('exposes all new Prisma delegate models on PrismaClient', () => {
    expect(prisma.demoBooking).toBeDefined();
    expect(prisma.demoSession).toBeDefined();
    expect(prisma.demoSessionTutorAssignment).toBeDefined();
    expect(prisma.demoSessionException).toBeDefined();
    expect(prisma.demoAttendance).toBeDefined();
    expect(prisma.demoFeedbackRecord).toBeDefined();
    expect(prisma.demoRoadmap).toBeDefined();
    expect(prisma.demoAcademicPlan).toBeDefined();
    expect(prisma.demoBookingRescheduleHistory).toBeDefined();
    expect(prisma.roundRobinCoordinatorState).toBeDefined();
  });

  it('preserves legacy models on PrismaClient without modification', () => {
    expect(prisma.demo).toBeDefined();
    expect(prisma.demoFeedback).toBeDefined();
    expect(prisma.demoRescheduleHistory).toBeDefined();
  });
});
