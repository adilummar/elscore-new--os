"use client";

import * as React from 'react';
import { getMyCalendar } from '../mentoring/mentoring-client';
import { TutorCalendar, TutorTimetable, addDays, mondayOf, todayIso } from '../tutors/[id]/TutorTimetable';

import { MyClasses, MyEarnings } from './TutorClasses';

/**
 * The tutor portal. A tutor sees their own classes for a chosen date or week, with the students behind them. There is no
 * tutor id anywhere on this page or in its request: the API starts from who is signed in, so one tutor can never open
 * another's classes. It also lists the classes in the chosen dates with a form to send each class update, and the tutor's own verified classes and earnings.
 */
export default function TutorPortalPage() {
  const [selected, setSelected] = React.useState(todayIso);
  const [mode, setMode] = React.useState<'day' | 'week'>('day');
  const [calendar, setCalendar] = React.useState<TutorCalendar | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const from = mode === 'week' ? mondayOf(selected) : selected;
  const to = mode === 'week' ? addDays(from, 6) : selected;

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getMyCalendar(from, to)
      .then((c) => {
        if (cancelled) return;
        setCalendar(c);
        setError(null);
      })
      .catch((e: unknown) => !cancelled && setError(e instanceof Error && e.message ? e.message : 'Your classes could not be loaded.'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [from, to]);

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4">
      <header>
        <h1 className="text-xl font-semibold text-slate-900">My classes</h1>
        {calendar && <p className="text-sm text-slate-600">{calendar.tutor.name}. {calendar.tutor.subjects.join(', ') || 'No subjects listed'}.</p>}
      </header>
      <TutorTimetable calendar={calendar} selected={selected} mode={mode} loading={loading} error={error} onSelect={setSelected} onMode={setMode} />
      <MyClasses from={from} to={to} />
      <MyEarnings />
    </div>
  );
}
