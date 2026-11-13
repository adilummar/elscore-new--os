import { ExamDetailClient } from './ExamDetailClient';

export default function ExamDetailPage({ params }: { params: { activationId: string } }) {
  return <ExamDetailClient activationId={decodeURIComponent(params.activationId)} />;
}
