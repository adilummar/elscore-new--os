import { readFileSync } from 'fs';
import { join } from 'path';

const read = (relative: string) => readFileSync(join(__dirname, relative), 'utf8').replace(/\r\n/g, '\n');
const allocation = read('allocation/AllocationClient.tsx');
const staff = read('staff/StaffClient.tsx');

describe('Allocation page uses the server eligibility rule', () => {
  it('fills the Mentor dropdown from eligibleForManual, not from a client-side "active" check', () => {
    expect(allocation).toContain("s.role === 'MENTOR' && s.eligibleForManual");
    expect(allocation).not.toMatch(/s\.role === 'MENTOR' && s\.isActive/);
  });

  it('never offers the Mentoring Head or Demo Counselors as Mentors (role filter stays MENTOR only)', () => {
    expect(allocation).not.toMatch(/MENTORING_HEAD|DEMO_COUNSELOR/);
  });

  it('explains an empty dropdown instead of showing an unexplained empty list', () => {
    expect(allocation).toContain('No eligible Mentors yet');
    expect(allocation).toContain('Add missing Mentors');
  });

  it('shows why a staff member is not eligible and flags an account awaiting first sign-in', () => {
    expect(allocation).toContain('s.ineligibleReason');
    expect(allocation).toContain('PENDING_SETUP');
  });

  it('keeps the automatic allocation controls and the queue action', () => {
    expect(allocation).toContain('/mentoring/allocation/run-auto');
    expect(allocation).toContain('/mentoring/allocation/settings');
  });
});

describe('Staff page can add the Mentors created before profiles were automatic', () => {
  it('calls the sync endpoint and reports what it did', () => {
    expect(staff).toContain("'/mentoring/staff/sync'");
    expect(staff).toContain('Add missing Mentors');
    expect(staff).toContain('r.created');
  });
});
