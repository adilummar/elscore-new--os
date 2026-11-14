import MentorDashboard from '@/components/dashboard/MentorDashboard';
import { DashboardClient } from './DashboardClient';

export default function MentorDashboardPage({
  searchParams,
}: {
  searchParams?: { card?: string; from?: string; to?: string; period?: string };
}) {
  if (searchParams?.card) {
    return <DashboardClient initialCard={searchParams.card} />;
  }
  return <MentorDashboard searchParams={searchParams} />;
}
