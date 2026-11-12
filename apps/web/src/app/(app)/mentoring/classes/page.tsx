import { ClassListClient } from './ClassListClient';

export default function ClassesPage({ searchParams }: { searchParams?: { date?: string; from?: string; to?: string; card?: string; state?: string; mentorUserId?: string; studentQuery?: string; tutorProfileId?: string; subjectId?: string } }) {
  const text = (v: unknown) => (typeof v === 'string' ? v : '');
  return <ClassListClient initialDate={text(searchParams?.date)} initialFrom={text(searchParams?.from)} initialTo={text(searchParams?.to)} initialCard={text(searchParams?.card)} initialState={text(searchParams?.state)} initialMentor={text(searchParams?.mentorUserId)} initialStudent={text(searchParams?.studentQuery)} initialTutor={text(searchParams?.tutorProfileId)} initialSubject={text(searchParams?.subjectId)} />;
}
