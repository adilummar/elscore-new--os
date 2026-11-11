import { DashboardClient } from './DashboardClient';

export default function MentorDashboardPage({ searchParams }: { searchParams?: { card?: string } }) {
  return <DashboardClient initialCard={typeof searchParams?.card === 'string' ? searchParams.card : undefined} />;
}
