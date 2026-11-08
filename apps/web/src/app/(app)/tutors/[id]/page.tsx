"use client";

import * as React from 'react';
import { useParams } from 'next/navigation';
import { getTutorCalendar } from '../../mentoring/mentoring-client';
import { TutorCalendar, TutorTimetable, addDays, mondayOf, todayIso } from './TutorTimetable';

/**
 * A tutor's profile timetable: choose a date and see which classes are booked, what is free, the breaks, and any leave or
 * holiday. The student behind a booked class is shown only to people who may see that student; the API decides.
 */
export default function TutorTimetablePage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const [selected, setSelected] = React.useState(todayIso);
  const [mode, setMode] = React.useState<'day' | 'week'>('day');
  const [calendar, setCalendar] = React.useState<TutorCalendar | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const from = mode === 'week' ? mondayOf(selected) : selected;
  const to = mode === 'week' ? addDays(from, 6) : selected;

  React.useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    getTutorCalendar(id, from, to)
      .then((c) => {
        if (cancelled) return;
        setCalendar(c);
        setError(null);
      })
      .catch((e: unknown) => !cancelled && setError(e instanceof Error && e.message ? e.message : 'The timetable could not be loaded.'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [id, from, to]);

  const tutor = calendar?.tutor;
  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4">
      <header>
        <h1 className="text-xl font-semibold text-slate-900">{tutor ? tutor.name : 'Tutor timetable'}</h1>
        {tutor && (
          <p className="text-sm text-slate-600">
            {tutor.subjects.join(', ') || 'No subjects listed'}. Levels: {tutor.levels.join(', ') || 'none listed'}.{tutor.active ? '' : ' Not active for new assignments.'}
          </p>
        )}
      </header>
      <TutorTimetable calendar={calendar} selected={selected} mode={mode} loading={loading} error={error} onSelect={setSelected} onMode={setMode} />
    </div>
  );
}
