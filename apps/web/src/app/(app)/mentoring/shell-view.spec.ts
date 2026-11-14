import { breadcrumbsOf, isCurrent, landingPath, primaryNav, readOnlyNotice, secondaryNav, sectionOf } from './shell-view';

const has = (...p: string[]) => (x: string) => p.includes(x);

describe('the Mentoring shell', () => {
  it('shows Classes, Exams, Meetings and Complaints first, in that order, to anyone who can see students', () => {
    expect(primaryNav(has('mentoring.student.read-assigned')).map((n) => n.label)).toEqual(['Classes', 'Exams', 'Meetings', 'Complaints']);
    expect(primaryNav(has('mentoring.student.read-all')).map((n) => n.label)).toEqual(['Classes', 'Exams', 'Meetings', 'Complaints']);
  });

  it('shows no workspace to someone without student access', () => {
    expect(primaryNav(has('mentoring.task.work'))).toEqual([]);
  });

  it('keeps allocation, staff and final approvals away from a plain Mentor', () => {
    const labels = secondaryNav(has('mentoring.student.read-assigned', 'mentoring.task.work')).map((n) => n.label);
    expect(labels).toEqual(['My students', 'Phase 1 onboarding', 'Pending actions', 'Overview']);
  });

  it('offers allocation and staff to those who hold the permission', () => {
    const labels = secondaryNav(has('mentoring.student.read-all', 'mentoring.allocation.read', 'mentoring.staff.read')).map((n) => n.label);
    expect(labels).toEqual(expect.arrayContaining(['Allocation', 'Mentors and counselors', 'Final approvals']));
  });

  it('never lists the same destination twice', () => {
    const all = [...primaryNav(() => true), ...secondaryNav(() => true)].map((n) => n.href);
    expect(new Set(all).size).toBe(all.length);
  });

  it('lands on Classes, else the first area the person has', () => {
    expect(landingPath(has('mentoring.student.read-assigned'))).toBe('/mentoring/classes');
    expect(landingPath(has('mentoring.task.work'))).toBe('/mentoring/tasks');
    expect(landingPath(has())).toBeNull();
  });

  it('knows the section of a path', () => {
    expect(sectionOf('/mentoring')).toBe('classes');
    expect(sectionOf('/mentoring/exams')).toBe('exams');
    expect(sectionOf('/mentoring/students/abc')).toBe('students');
  });

  it('builds breadcrumbs with a linked parent and an unlinked current page', () => {
    expect(breadcrumbsOf('/mentoring/classes')).toEqual([{ label: 'Mentoring', href: '/mentoring' }, { label: 'Classes' }]);
    expect(breadcrumbsOf('/mentoring/students/abc', 'Asha')).toEqual([
      { label: 'Mentoring', href: '/mentoring' }, { label: 'My students', href: '/mentoring/students' }, { label: 'Asha' },
    ]);
  });

  it('words the student and overview links for department-wide visibility', () => {
    const labels = secondaryNav(has('mentoring.student.read-all')).map((n) => n.label);
    expect(labels).toEqual(expect.arrayContaining(['All students', 'Department overview']));
    expect(labels).not.toContain('My students');
    expect(breadcrumbsOf('/mentoring/students', undefined, has('mentoring.student.read-all'))[1].label).toBe('All students');
    expect(breadcrumbsOf('/mentoring/students', undefined, has('mentoring.student.read-assigned'))[1].label).toBe('My students');
  });

  it('tells items that share a page apart by their query', () => {
    const all = [...primaryNav(() => true), ...secondaryNav(() => true)];
    const items = Object.fromEntries(all.map((n) => [n.section, n]));
    expect(isCurrent(items.students, '/mentoring/students', {})).toBe(true);
    expect(isCurrent(items.onboarding, '/mentoring/students', {})).toBe(false);
    expect(isCurrent(items.onboarding, '/mentoring/students', { status: 'ACTIVATION_IN_PROGRESS' })).toBe(true);
    expect(isCurrent(items.students, '/mentoring/students', { status: 'ACTIVATION_IN_PROGRESS' })).toBe(false);
    expect(isCurrent(items.complaints, '/mentoring/complaints', {})).toBe(true);
    expect(isCurrent(items.complaints, '/mentoring/dashboard', { card: 'complaints_open' })).toBe(true);
    expect(isCurrent(items.overview, '/mentoring/dashboard', { card: 'complaints_open' })).toBe(false);
    expect(isCurrent(items.overview, '/mentoring/overview', {})).toBe(true);
    expect(items.overview.href).toBe('/mentoring/overview');
    expect(isCurrent(primaryNav(() => true)[0], '/mentoring/classes/abc', {})).toBe(true);
  });

  it('says so to someone who can view but not work, and stays quiet for a Mentor', () => {
    expect(readOnlyNotice(has('mentoring.student.read-all'))).toContain('You can view Mentoring records');
    expect(readOnlyNotice(has('mentoring.student.read-assigned', 'mentoring.stage.work'))).toBeNull();
    expect(readOnlyNotice(has())).toBeNull();
  });
});
