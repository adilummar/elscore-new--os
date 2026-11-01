import { StudentListClient } from '../students/StudentListClient';

export default function MentoringApprovalsPage() {
  return <StudentListClient title="Pending final approval" fixedStatus="PENDING_FINAL_APPROVAL" />;
}
