import { ClassListClient } from './ClassListClient';

export default function DailyClassListPage({ searchParams }: { searchParams?: { date?: string; from?: string; to?: string; card?: string; state?: string; mentorUserId?: string; studentQuery?: string } }) {
  const text = (v: unknown) => (typeof v === 'string' ? v : '');
  return <ClassListClient initialDate={text(searchParams?.date)} initialFrom={text(searchParams?.from)} initialTo={text(searchParams?.to)} initialCard={text(searchParams?.card)} initialState={text(searchParams?.state)} initialMentor={text(searchParams?.mentorUserId)} initialStudent={text(searchParams?.studentQuery)} />;
}
