/**
 * The Mentoring shell: which workspaces and supporting areas a person sees, which one is active, and the breadcrumb trail.
 * Pure rules over a permission list and a path. This only decides what to show; the API still decides what anyone may do.
 */
export interface NavItem { href: string; label: string; section: string }

type Can = (permission: string) => boolean;

const sees = (can: Can) => can('mentoring.student.read-all') || can('mentoring.student.read-assigned');
/** Department-wide visibility: the Mentoring Head, the CEO and the Co-founder. */
const wide = (can: Can) => can('mentoring.student.read-all');

/** Phase 1 onboarding is the students whose activation is in progress. */
export const ONBOARDING_HREF = '/mentoring/students?status=ACTIVATION_IN_PROGRESS';

/** The three workspaces. They stay first and largest. */
export function primaryNav(can: Can): NavItem[] {
  if (!sees(can)) return [];
  return [
    { href: '/mentoring/classes', label: 'Classes', section: 'classes' },
    { href: '/mentoring/exams', label: 'Exams', section: 'exams' },
    { href: '/mentoring/meetings', label: 'Meetings', section: 'meetings' },
  ];
}

/** Supporting areas, each reachable in one place only. */
export function secondaryNav(can: Can): NavItem[] {
  const out: NavItem[] = [];
  if (sees(can)) {
    out.push({ href: '/mentoring/students', label: wide(can) ? 'All students' : 'My students', section: 'students' });
    out.push({ href: ONBOARDING_HREF, label: 'Phase 1 onboarding', section: 'onboarding' });
    out.push({ href: '/mentoring/dashboard?card=complaints_open', label: 'Complaints', section: 'complaints' });
  }
  if (can('mentoring.task.work') || can('mentoring.task.create')) out.push({ href: '/mentoring/tasks', label: 'Pending actions', section: 'tasks' });
  if (can('mentoring.allocation.read') || can('mentoring.staff.read')) out.push({ href: '/mentoring/allocation', label: 'Allocation', section: 'allocation' });
  if (can('mentoring.approval.final') || wide(can)) out.push({ href: '/mentoring/approvals', label: 'Final approvals', section: 'approvals' });
  if (can('mentoring.staff.read')) out.push({ href: '/mentoring/staff', label: 'Mentors and counselors', section: 'staff' });
  if (sees(can)) out.push({ href: '/mentoring/overview', label: wide(can) ? 'Department overview' : 'Overview', section: 'overview' });
  return out;
}

/** The first place a person should land, or null when Mentoring has nothing for them. */
export function landingPath(can: Can): string | null {
  const first = primaryNav(can)[0] ?? secondaryNav(can)[0];
  return first ? first.href.split('?')[0] : null;
}

/** The section a path belongs to: the segment after /mentoring. The bare /mentoring counts as Classes, its landing place. */
export function sectionOf(pathname: string): string {
  const seg = pathname.replace(/\/+$/, '').split('/')[2] ?? '';
  return seg || 'classes';
}

/**
 * Which nav item is current. Two items can share a page (My students and Phase 1 onboarding are both the student list, Complaints and the
 * overview are both the dashboard), so those are told apart by the one query value that differs.
 */
export function isCurrent(item: NavItem, pathname: string, query: { status?: string | null; card?: string | null } = {}): boolean {
  const section = sectionOf(pathname);
  if (item.section === 'onboarding') return section === 'students' && query.status === 'ACTIVATION_IN_PROGRESS';
  if (item.section === 'students') return section === 'students' && query.status !== 'ACTIVATION_IN_PROGRESS';
  if (item.section === 'complaints') return section === 'dashboard' && !!query.card?.startsWith('complaints_');
  return item.section === section;
}

/** What to tell someone who can look at Mentoring records but cannot change them (the Head, the CEO, the Co-founder). Null for those who can work. */
export function readOnlyNotice(can: Can): string | null {
  if (!sees(can) || can('mentoring.stage.work')) return null;
  return 'You can view Mentoring records here. Changes and verification are made by the assigned Mentor.';
}

const titleOf = (section: string, can?: Can): string => {
  const base: Record<string, string> = {
    classes: 'Classes', exams: 'Exams', meetings: 'Meetings', students: can && wide(can) ? 'All students' : 'My students', tasks: 'Pending actions', allocation: 'Allocation',
    approvals: 'Final approvals', staff: 'Mentors and counselors', dashboard: 'Work lists', overview: can && wide(can) ? 'Department overview' : 'Overview',
  };
  return base[section] ?? 'Mentoring';
};

export interface Crumb { label: string; href?: string }

/** Mentoring / Section / (what is open). The last crumb is the current page and has no link. */
export function breadcrumbsOf(pathname: string, detail?: string, can?: Can): Crumb[] {
  const section = sectionOf(pathname);
  const depth = pathname.replace(/\/+$/, '').split('/').length - 2;
  const title = titleOf(section, can);
  const crumbs: Crumb[] = [{ label: 'Mentoring', href: '/mentoring' }];
  if (depth <= 1) return [...crumbs, { label: title }];
  crumbs.push({ label: title, href: `/mentoring/${section}` });
  crumbs.push({ label: detail || 'Details' });
  return crumbs;
}
