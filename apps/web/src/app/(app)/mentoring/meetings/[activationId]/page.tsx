import { MeetingDetailClient } from './MeetingDetailClient';

export default function MeetingDetailPage({ params, searchParams }: { params: { activationId: string }; searchParams?: { view?: string } }) {
  return <MeetingDetailClient activationId={decodeURIComponent(params.activationId)} initialView={searchParams?.view === 'plan' ? 'plan' : 'review'} />;
}
