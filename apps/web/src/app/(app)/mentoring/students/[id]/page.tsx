import { panelOf } from '../../dashboard-view';

import { StudentWorkspaceClient } from './StudentWorkspaceClient';

export default function MentoringStudentPage({ params, searchParams }: { params: { id: string }; searchParams?: { panel?: string } }) {
  return <StudentWorkspaceClient activationId={params.id} initialPanel={panelOf(searchParams?.panel)} />;
}
