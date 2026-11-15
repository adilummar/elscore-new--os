import * as fs from 'fs';
import * as path from 'path';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { Banner, Overlay, StatTile } from './mentoring-ui';

const root = path.resolve(__dirname, '..', '..', '..', '..');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');

describe('Mentoring overlay', () => {
  const html = renderToStaticMarkup(React.createElement(Overlay, { title: 'Complaint 12', onClose: () => undefined, testId: 'o', closeLabel: 'Close drawer' }, React.createElement('p', null, 'Body')));
  it('is a labelled modal dialog with a named close control and focus target', () => {
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toMatch(/aria-labelledby="[^"]+"/);
    expect(html).toContain('tabindex="-1"');
    expect(html).toContain('aria-label="Close drawer"');
  });
  it('only animates when motion is allowed', () => {
    expect(html).toContain('motion-safe:animate-overlay-in');
    expect(html).not.toMatch(/(^|\s)animate-overlay/);
  });
});

describe('Mentoring status components', () => {
  it('announces errors as alerts and other banners as status', () => {
    expect(renderToStaticMarkup(React.createElement(Banner, { tone: 'error' }, 'x'))).toContain('role="alert"');
    expect(renderToStaticMarkup(React.createElement(Banner, { tone: 'success' }, 'x'))).toContain('role="status"');
  });
  it('shows a count with its words, and amber only for attention', () => {
    const a = renderToStaticMarkup(React.createElement(StatTile, { value: 3, label: 'Waiting', attention: true }));
    const b = renderToStaticMarkup(React.createElement(StatTile, { value: 0, label: 'Waiting' }));
    expect(a).toContain('text-amber-800');
    expect(b).not.toContain('text-amber');
  });
});

describe('Mentoring text contrast and motion', () => {
  const files = [
    'src/app/(app)/mentoring/ExamDetailDrawer.tsx', 'src/app/(app)/mentoring/ClassWorkspaceDrawer.tsx', 'src/app/(app)/mentoring/ClassWorkspaceExtras.tsx', 'src/app/(app)/mentoring/complaints/ComplaintsWorkspaceClient.tsx',
    'src/app/(app)/mentoring/dashboard/DashboardClient.tsx', 'src/app/(app)/mentoring/allocation/AllocationClient.tsx', 'src/app/(app)/mentoring/tasks/TaskBoardClient.tsx', 'src/app/(app)/tutor-portal/TutorClasses.tsx',
    'src/app/(app)/tutor-portal/TutorExams.tsx', 'src/app/(app)/dashboard/MentoringOverview.tsx', 'src/components/dashboard/MentorDashboard.tsx',
  ];
  it.each(files)('%s keeps text at AA contrast and moves only when allowed', (f) => {
    const src = read(f);
    expect(src).not.toMatch(/(?<![:\w-])text-(slate-400|slate-500|amber-[56]00|emerald-[56]00)\b/);
    expect(src).not.toMatch(/text-\[1[01]px\]/);
    expect(src).not.toMatch(/(?<![:\w-])animate-(spin|pulse)\b/);
  });
  it('the Exam and Complaint overlays use the shared dialog, not their own', () => {
    expect(read('src/app/(app)/mentoring/ExamDetailDrawer.tsx')).toContain('<Overlay');
    const c = read('src/app/(app)/mentoring/complaints/ComplaintsWorkspaceClient.tsx');
    expect(c.match(/<Overlay/g)?.length).toBe(2);
    expect(c).not.toContain('fixed inset-0');
  });
});
