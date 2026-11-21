import { MentoringCapacityService } from './mentoring-capacity.service';

/** A team row says how many of the Mentor's students have no monthly hours, so a low total is not mistaken for spare capacity. */
describe('team capacity and students without hours', () => {
  const prisma: any = {
    mentoringStaffProfile: { findMany: jest.fn().mockResolvedValue([{ userId: 'm1', role: 'MENTOR', isActive: true, monthlyHourLimit: 60 }]) },
    mentoringSetting: { findUnique: jest.fn().mockResolvedValue(null) },
    mentoringActivation: { findMany: jest.fn().mockResolvedValue([
      { id: 'a1', studentId: 's1', status: 'ACTIVATED', currentMentorUserId: 'm1', student: { businessId: 'STU-1', firstName: 'Asha', lastName: 'K' } },
      { id: 'a2', studentId: 's2', status: 'ACTIVATED', currentMentorUserId: 'm1', student: { businessId: 'STU-2', firstName: 'Ravi', lastName: 'P' } },
      { id: 'a3', studentId: 's3', status: 'ACTIVATED', currentMentorUserId: 'm1', student: { businessId: 'STU-3', firstName: 'Mina', lastName: 'T' } },
    ]) },
    requirement: { findMany: jest.fn().mockResolvedValue([{ studentId: 's1', monthlyHours: 20 }, { studentId: 's2', monthlyHours: null }]) },
    employee: { findMany: jest.fn().mockResolvedValue([{ userId: 'm1', firstName: 'Maya', lastName: 'Mentor' }]) },
  };

  it('counts students with missing or zero hours, and still lists them', async () => {
    const team = await new MentoringCapacityService(prisma).teamOverview();
    expect(team.mentors[0]).toMatchObject({ name: 'Maya Mentor', studentCount: 3, allocatedHours: 20, studentsWithoutHours: 2 });
  });
});
