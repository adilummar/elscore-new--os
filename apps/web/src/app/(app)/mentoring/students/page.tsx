import { ACTIVATION_LABELS } from '../labels';

import { StudentListClient } from './StudentListClient';

const ONBOARDING_STATUS = 'ACTIVATION_IN_PROGRESS';

/** The list opens on a status when the address names a real one, so Phase 1 onboarding is one link away. */
export default function MentoringStudentsPage({ searchParams }: { searchParams?: { status?: string } }) {
  const status = typeof searchParams?.status === 'string' && ACTIVATION_LABELS[searchParams.status] ? searchParams.status : '';
  return <StudentListClient title={status === ONBOARDING_STATUS ? 'Phase 1 onboarding' : 'Students'} initialStatus={status} />;
}
