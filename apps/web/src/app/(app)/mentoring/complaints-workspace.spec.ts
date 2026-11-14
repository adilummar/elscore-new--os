import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { ComplaintsWorkspaceClient } from './complaints/ComplaintsWorkspaceClient';
import { mentoringApi } from './mentoring-client';
import { ComplaintList } from './complaint-view';

jest.mock('./mentoring-client', () => ({
  mentoringApi: jest.fn(),
}));

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: any) => React.createElement('a', { href, ...rest }, children),
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

const mockComplaintList: ComplaintList = {
  canLog: true,
  counts: {
    STARTED: 2,
    ONGOING: 1,
    RESOLVED: 1,
    new: 1,
    WITHIN_SLA: 1,
    APPROACHING: 1,
    BREACHED: 1,
    SLA_RESOLVED: 1,
  },
  rows: [
    {
      id: 'comp-1',
      number: 'CMP-00001',
      title: 'Tutor late for physics class',
      category: 'TUTOR',
      categoryLabel: 'Tutor',
      priority: 'HIGH',
      priorityLabel: 'High',
      activationId: 'act-1',
      studentName: 'Aarav Patel',
      parentName: 'Sunita Patel',
      status: 'NEW',
      statusLabel: 'New',
      stage: 'STARTED',
      stageLabel: 'Started',
      assignedToUserId: null,
      assignedToName: null,
      receivedAt: '2026-11-14T06:00:00.000Z',
      ack: {
        startedAt: '2026-11-14T06:00:00.000Z',
        dueAt: '2026-11-14T08:00:00.000Z',
        acknowledgedAt: null,
        firstResponseAt: null,
        state: 'BREACHED',
        stateLabel: 'SLA breached',
        metSla: false,
        overdueMinutes: 30,
        remainingMinutes: 0,
        target: { label: 'Two-hour acknowledgement', targetMinutes: 120, mode: 'WORKING_HOURS' },
      },
      resolutionMinutes: null,
      reopenCount: 0,
    },
    {
      id: 'comp-2',
      number: 'CMP-00002',
      title: 'Timetable clash on Wednesday',
      category: 'TIMETABLE',
      categoryLabel: 'Timetable',
      priority: 'NORMAL',
      priorityLabel: 'Normal',
      activationId: 'act-2',
      studentName: 'Zara Khan',
      parentName: 'Imran Khan',
      status: 'IN_PROGRESS',
      statusLabel: 'In progress',
      stage: 'ONGOING',
      stageLabel: 'Ongoing',
      assignedToUserId: 'user-mentor',
      assignedToName: 'Mentor Test',
      receivedAt: '2026-11-14T04:30:00.000Z',
      ack: {
        startedAt: '2026-11-14T04:30:00.000Z',
        dueAt: '2026-11-14T06:30:00.000Z',
        acknowledgedAt: '2026-11-14T05:00:00.000Z',
        firstResponseAt: '2026-11-14T05:00:00.000Z',
        state: 'RESOLVED',
        stateLabel: 'Resolved',
        metSla: true,
        overdueMinutes: 0,
        remainingMinutes: 0,
        target: { label: 'Two-hour acknowledgement', targetMinutes: 120, mode: 'WORKING_HOURS' },
      },
      resolutionMinutes: null,
      reopenCount: 0,
    },
  ],
};

describe('ComplaintsWorkspaceClient Component', () => {
  beforeEach(() => {
    (mentoringApi as jest.Mock).mockImplementation((path: string) => {
      if (path.includes('/mentoring/overview/activations')) {
        return Promise.resolve({
          rows: [
            { activationId: 'act-1', studentName: 'Aarav Patel', studentId: 'STU-001' },
            { activationId: 'act-2', studentName: 'Zara Khan', studentId: 'STU-002' },
          ],
        });
      }

      if (path.includes('/mentoring/complaints')) {
        return Promise.resolve(mockComplaintList);
      }

      return Promise.resolve({});
    });
  });

  it('renders overview metrics cards for all statuses and SLA states', () => {
    const html = render(React.createElement(ComplaintsWorkspaceClient, { canHandle: true, initialData: mockComplaintList }));
    const t = text(html);

    expect(t).toContain('Total Assigned');
    expect(t).toContain('New');
    expect(t).toContain('Awaiting Ack');
    expect(t).toContain('In Progress');
    expect(t).toContain('Waiting Parent/Tutor');
    expect(t).toContain('Resolved');
    expect(t).toContain('Reopened');
    expect(t).toContain('SLA Breached');
  });

  it('renders filter bar with search, category, priority, status, and SLA options', () => {
    const html = render(React.createElement(ComplaintsWorkspaceClient, { canHandle: true, initialData: mockComplaintList }));
    const t = text(html);

    expect(t).toContain('Filter Complaints');
    expect(t).toContain('Student / Parent / Number');
    expect(t).toContain('Category');
    expect(t).toContain('All Categories');
    expect(t).toContain('Priority');
    expect(t).toContain('All Priorities');
    expect(t).toContain('Status');
    expect(t).toContain('All Statuses');
    expect(t).toContain('SLA Status');
    expect(t).toContain('All SLA Statuses');
    expect(t).toContain('Received Date Range');
  });

  it('renders the complaints table with complaint details and action button', () => {
    const html = render(React.createElement(ComplaintsWorkspaceClient, { canHandle: true, initialData: mockComplaintList }));
    const t = text(html);

    expect(t).toContain('Number');
    expect(t).toContain('Title');
    expect(t).toContain('Student');
    expect(t).toContain('Parent');
    expect(t).toContain('Category');
    expect(t).toContain('Priority');
    expect(t).toContain('Status');
    expect(t).toContain('Received');
    expect(t).toContain('Ack SLA');
    expect(t).toContain('Action');

    expect(html).toContain('data-testid="complaints-table"');
    expect(t).toContain('CMP-00001');
    expect(t).toContain('Tutor late for physics class');
    expect(t).toContain('Aarav Patel');
    expect(t).toContain('Sunita Patel');
  });

  it('renders the Log a Complaint button when authorized', () => {
    const html = render(React.createElement(ComplaintsWorkspaceClient, { canHandle: true, initialData: mockComplaintList }));
    expect(text(html)).toContain('Log a Complaint');

    const htmlNoAuth = render(React.createElement(ComplaintsWorkspaceClient, { canHandle: false, initialData: mockComplaintList }));
    expect(text(htmlNoAuth)).not.toContain('Log a Complaint');
  });
});
