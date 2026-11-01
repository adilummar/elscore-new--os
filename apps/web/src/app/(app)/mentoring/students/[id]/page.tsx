import { StudentWorkspaceClient } from './StudentWorkspaceClient';

export default function MentoringStudentPage({ params }: { params: { id: string } }) {
  return <StudentWorkspaceClient activationId={params.id} />;
}
