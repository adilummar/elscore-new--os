import { TAB_FOR_PANEL, tabOf, wantsActivationWorkflow } from '../../student-hub-view';
import { panelOf } from '../../dashboard-view';

import { StudentHubWorkspace } from './StudentHubWorkspace';
import { StudentWorkspaceClient } from './StudentWorkspaceClient';

/**
 * The Student Workspace. The activation workflow (stage checklist, handover information, tasks) keeps its own page for students who are
 * still being onboarded; every older link to a panel such as ?panel=classes opens the matching tab here.
 */
export default function MentoringStudentPage({ params, searchParams }: { params: { id: string }; searchParams?: { panel?: string; tab?: string } }) {
  if (wantsActivationWorkflow(searchParams?.panel)) return <StudentWorkspaceClient activationId={params.id} initialPanel={panelOf(searchParams?.panel)} />;
  const fromPanel = searchParams?.panel ? TAB_FOR_PANEL[searchParams.panel] : undefined;
  return <StudentHubWorkspace activationId={params.id} initialTab={searchParams?.tab ? tabOf(searchParams.tab) : fromPanel} />;
}
