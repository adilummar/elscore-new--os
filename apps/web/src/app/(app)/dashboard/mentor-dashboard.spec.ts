import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import MentorDashboard from '@/components/dashboard/MentorDashboard';
import { mentoringApi } from '../mentoring/mentoring-client';

jest.mock('../mentoring/mentoring-client', () => ({
  mentoringApi: jest.fn(),
}));

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: any) => React.createElement('a', { href, ...rest }, children),
}));

jest.mock('../mentoring/ClassWorkspaceDrawer', () => ({
  ClassWorkspaceDrawer: function MockDrawer({ classKey, role }: any) {
    return React.createElement('div', { 'data-testid': 'mock-workspace-drawer', 'data-key': classKey, 'data-role': role }, 'Drawer');
  },
}));

const text = (markup: string) =>
  markup
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();

const render = (el: React.ReactElement) => renderToStaticMarkup(el);

describe('MentorDashboard Component', () => {
  beforeEach(() => {
    (mentoringApi as jest.Mock).mockImplementation((path: string) => {
      if (path.includes('/mentoring/overview/activations')) {
        return Promise.resolve({
          rows: [
            {
              activationId: 'act-1',
              studentName: 'Aarav Patel',
              studentId: 'STU-001',
              stageNumber: 2,
              stageName: 'Baseline Assessment',
              status: 'HANDOVER_IN_PROGRESS',
              statusLabel: 'Handover in progress',
              responsible: 'Mentor Test',
              nextAction: 'Complete Baseline Assessment',
              daysPending: 3,
              blocked: false,
            },
            {
              activationId: 'act-2',
              studentName: 'Zara Khan',
              studentId: 'STU-002',
              stageNumber: 7,
              stageName: 'Final Handover',
              status: 'PENDING_FINAL_APPROVAL',
              statusLabel: 'Pending final approval',
              responsible: 'Mentoring Head',
              nextAction: 'Give final approval',
              daysPending: 6,
              blocked: false,
            },
          ],
        });
      }

      if (path.includes('/mentoring/overview/today')) {
        return Promise.resolve({
          today: '2026-11-14',
          date: '2026-11-14',
          total: 4,
          counts: {
            SCHEDULED: 1,
            AWAITING_TUTOR_UPDATE: 1,
            AWAITING_MENTOR_VERIFICATION: 1,
            VERIFIED: 1,
            NOT_CONDUCTED: 0,
            RESCHEDULED: 0,
          },
          rows: [
            {
              key: 'session-101',
              activationId: 'act-1',
              studentName: 'Aarav Patel',
              subjectName: 'Mathematics',
              tutorName: 'Rajesh Sharma',
              startMinute: 600,
              endMinute: 660,
              state: 'AWAITING_MENTOR_VERIFICATION',
              stateLabel: 'Awaiting Mentor verification',
              warning: 'Response time approaching',
            },
            {
              key: 'session-102',
              activationId: 'act-2',
              studentName: 'Zara Khan',
              subjectName: 'Physics',
              tutorName: 'Anita Desai',
              startMinute: 720,
              endMinute: 780,
              state: 'AWAITING_TUTOR_UPDATE',
              stateLabel: 'Awaiting tutor update',
              warning: null,
            },
          ],
        });
      }

      if (path.includes('/mentoring/exams/due')) {
        return Promise.resolve({
          thresholdMinutes: 180,
          rows: [
            {
              activationId: 'act-1',
              studentName: 'Aarav Patel',
              subjectId: 'sub-math',
              subjectName: 'Mathematics',
              verifiedMinutes: 150,
              thresholdMinutes: 180,
              progressPercent: 83,
              due: false,
              scheduledExam: null,
            },
            {
              activationId: 'act-2',
              studentName: 'Zara Khan',
              subjectId: 'sub-phy',
              subjectName: 'Physics',
              verifiedMinutes: 180,
              thresholdMinutes: 180,
              progressPercent: 100,
              due: true,
              scheduledExam: { id: 'ex-1', date: '2026-11-18' },
            },
          ],
        });
      }

      if (path.includes('/mentoring/reviews')) {
        return Promise.resolve({
          counts: { SCHEDULED: 1 },
          overdue: 0,
          rows: [
            {
              activationId: 'act-1',
              studentName: 'Aarav Patel',
              parentName: 'Sunita Patel',
              date: '2026-11-20',
              state: 'SCHEDULED',
              stateLabel: 'Scheduled',
              overdue: false,
              preparation: {
                examsReviewed: true,
                nextPlanApproved: false,
                tutorObservations: 2,
              },
            },
          ],
        });
      }

      if (path.includes('/mentoring/complaints')) {
        return Promise.resolve({
          rows: [
            {
              id: 'comp-1',
              number: 'CMP-0001',
              title: 'Tutor replacement request',
              studentName: 'Aarav Patel',
              priority: 'HIGH',
              status: 'IN_PROGRESS',
              ack: {
                state: 'BREACHED',
                overdueMinutes: 45,
                remainingMinutes: 0,
              },
            },
          ],
        });
      }

      // Default: overview
      return Promise.resolve({
        role: 'MENTOR',
        today: '2026-11-14',
        window: { from: '2026-11-09', to: '2026-11-15' },
        period: 'week',
        summary: {
          activeStudents: 12,
          ongoingActivations: 2,
          scheduledMinutes: 7200, // 120 hrs
          reportedMinutes: 6000,  // 100 hrs
          consumedMinutes: 5400,  // 90 hrs
          remainingMinutes: 1800, // 30 hrs
          pendingClasses: 4,
          pendingVerification: 1,
          attentionTotal: 3,
        },
        activationByStatus: [],
        attention: [],
      });
    });
  });

  it('renders the header with title and direct workspace quick-links', () => {
    const html = render(React.createElement(MentorDashboard, {}));
    const t = text(html);

    expect(t).toContain('Mentor Dashboard');
    expect(html).toContain('href="/mentoring/classes"');
    expect(html).toContain('href="/mentoring/exams"');
    expect(html).toContain('href="/mentoring/reviews"');
    expect(html).toContain('href="/mentoring/complaints"');
  });

  it('renders the interactive filter bar with period tabs and filters', () => {
    const html = render(React.createElement(MentorDashboard, {}));
    const t = text(html);

    expect(t).toContain('Operational Filters');
    expect(t).toContain('Today');
    expect(t).toContain('This Week');
    expect(t).toContain('This Month');
    expect(t).toContain('Custom Range');
    expect(t).toContain('Student Search');
    expect(t).toContain('Subject');
    expect(t).toContain('Tutor');
    expect(t).toContain('Class Status');
    expect(t).toContain('Exam Status');
  });

  it('renders student overview cards scoped to the logged-in mentor', () => {
    const html = render(React.createElement(MentorDashboard, {}));
    const t = text(html);

    expect(t).toContain('Student Overview (Assigned Scope)');
    expect(t).toContain('Total Assigned Students');
    expect(t).toContain('Newly Received');
    expect(t).toContain('Handover Pending');
    expect(t).toContain('Handover In Progress');
    expect(t).toContain('Awaiting Final Head Approval');
    expect(t).toContain('Activated Students');
  });

  it('strictly separates teaching hours metrics and displays the data integrity notice', () => {
    const html = render(React.createElement(MentorDashboard, {}));
    const t = text(html);

    expect(t).toContain('Teaching Hours Overview');
    expect(t).toContain('Scheduled Hours');
    expect(t).toContain('Tutor-Reported Hours');
    expect(t).toContain('Mentor-Verified Hours');
    expect(t).toContain('Remaining Unverified Hours');
    expect(t).toContain('Verified Hours vs Scheduled');
    expect(t).toContain(
      'Only mentor-verified hours count toward student consumption and tutor payout'
    );
  });

  it('renders today class overview linking to filtered classes workspace', () => {
    const html = render(React.createElement(MentorDashboard, {}));
    const t = text(html);

    expect(t).toContain("Today's Class Overview");
    expect(t).toContain('Total Classes Today');
    expect(t).toContain('Upcoming Classes');
    expect(t).toContain('Awaiting Tutor Updates');
    expect(t).toContain('Awaiting Verification');
    expect(t).toContain('Verified Classes');
    expect(t).toContain('Not Conducted / Rescheduled');

    expect(html).toContain('href="/mentoring/classes"');
    expect(html).toContain('href="/mentoring/classes?classState=SCHEDULED"');
    expect(html).toContain('href="/mentoring/classes?card=classes_awaiting_update"');
    expect(html).toContain('href="/mentoring/classes?card=classes_awaiting_verification"');
    expect(html).toContain('href="/mentoring/classes?card=classes_verified"');
  });

  it('renders the 7-stage handover roadmap with restricted final approval badge', () => {
    const html = render(React.createElement(MentorDashboard, {}));
    const t = text(html);

    expect(t).toContain('Phase 1 Handover Overview (7 Stages)');
    expect(t).toContain('Student Allocation');
    expect(t).toContain('Baseline Assessment');
    expect(t).toContain('Parent Orientation');
    expect(t).toContain('Teacher Matching');
    expect(t).toContain('Schedule Setup');
    expect(t).toContain('Demo & Transition');
    expect(t).toContain('Final Handover');
    expect(t).toContain('HEAD ONLY');
    expect(t).toContain('Mentoring Head Only');
    expect(t).toContain('Current Stage');
    expect(t).toContain('Days Pending');
    expect(t).toContain('Responsible Role');
    expect(t).toContain('Next Required Action');
  });

  it('renders daily & upcoming operations sections', () => {
    const html = render(React.createElement(MentorDashboard, {}));
    const t = text(html);

    expect(t).toContain('Daily & Upcoming Operations');
    expect(t).toContain("Today's Classes");
    expect(t).toContain('Upcoming Exams & 3-Hour Progress');
    expect(t).toContain('Upcoming Parent Meetings');
    expect(t).toContain('Pending Actions Queue');
  });
});
