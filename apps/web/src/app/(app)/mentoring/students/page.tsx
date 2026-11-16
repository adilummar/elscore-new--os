import { filtersFromParams } from '../student-hub-view';

import { StudentListClient } from './StudentListClient';

/** The Students list. A link from the dashboard can open it with filters already applied. */
export default function MentoringStudentsPage({ searchParams }: { searchParams?: Record<string, string | string[] | undefined> }) {
  const get = (k: string) => { const v = searchParams?.[k]; return typeof v === 'string' ? v : null; };
  const filters = filtersFromParams(get);
  return <StudentListClient title={filters.status === 'ACTIVATION_IN_PROGRESS' ? 'Phase 1 onboarding' : 'Students'} initialFilters={filters} />;
}
