"use client";

import * as React from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';

import { ClassWorkspaceDrawer } from '../ClassWorkspaceDrawer';
import { STATE_CHOICES, STATE_TONE, timeLabel } from '../class-view';
import { mentoringApi } from '../mentoring-client';
import { addDays, longDayLabel } from '../timetable-view';
import { ListData, ListFilters, emptyListFilters, listQuery } from '../workspace-view';

const todayIso = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

/** Every class of a day with who, what and where it stands. Mentors see their own students; the Head sees all of them and can filter by Mentor. */
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const CARD_LABELS: Record<string, string> = {
  classes_today: "Today's scheduled classes", classes_upcoming: 'Upcoming classes', classes_awaiting_update: 'Waiting for the tutor update', classes_awaiting_verification: 'Waiting for the Mentor verification', classes_verified: 'Verified classes',
  classes_not_conducted: 'Classes not conducted', classes_rescheduled: 'Classes rescheduled', classes_voice_pending: 'Waiting for the voice recording', classes_conducted: 'Classes conducted', classes_awaiting_activities: 'Waiting for post-class activities', classes_cancelled: 'Classes cancelled',
};

export function ClassListClient({ initialDate = '', initialFrom = '', initialTo = '', initialCard = '', initialState = '', initialMentor = '', initialStudent = '' }: { initialDate?: string; initialFrom?: string; initialTo?: string; initialCard?: string; initialState?: string; initialMentor?: string; initialStudent?: string }) {
  const [f, setF] = React.useState<ListFilters>(() => ({
    ...emptyListFilters(DATE.test(initialDate) ? initialDate : todayIso()),
    from: DATE.test(initialFrom) ? initialFrom : '', to: DATE.test(initialTo) ? initialTo : '', card: CARD_LABELS[initialCard] ? initialCard : '',
    state: initialState, mentorUserId: initialMentor, studentQuery: initialStudent,
  }));
  const [page, setPage] = React.useState(1);
  const [data, setData] = React.useState<ListData | null>(null);
  const [known, setKnown] = React.useState<{ mentors: Map<string, string>; tutors: Map<string, string>; subjects: Map<string, string> }>({ mentors: new Map(), tutors: new Map(), subjects: new Map() });
  const [error, setError] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState<string | null>(null);

  const query = listQuery(f, page);
  const load = React.useCallback(async () => {
    try {
      const d: ListData = await mentoringApi(`/mentoring/class-workspace/list${query}`);
      setData(d);
      setKnown((k) => {
        const mentors = new Map(k.mentors);
        const tutors = new Map(k.tutors);
        const subjects = new Map(k.subjects);
        for (const r of d.rows) { if (r.mentorUserId && r.mentorName) mentors.set(r.mentorUserId, r.mentorName); tutors.set(r.tutorProfileId, r.tutorName); subjects.set(r.subjectId, r.subjectName); }
        return { mentors, tutors, subjects };
      });
      setError(null);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'The classes could not be loaded.');
    }
  }, [query]);
  React.useEffect(() => { void load(); }, [load]);

  const set = (patch: Partial<ListFilters>) => { setPage(1); setF((x) => ({ ...x, ...patch })); };
  const filtered = f.mentorUserId || f.studentQuery || f.tutorProfileId || f.subjectId || f.state || f.card;
  return (
    <div className="mx-auto max-w-6xl space-y-4" data-testid="class-list">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Daily classes</h1>
        <p className="text-sm text-slate-600">{f.from || f.to ? `${longDayLabel(f.from || f.to)} to ${longDayLabel(f.to || f.from)}` : longDayLabel(f.date)}. Each class shows who teaches it, who mentors the student and where it stands.</p>
      </header>
      {(f.card || f.from || f.to) && (
        <p className="flex flex-wrap items-center gap-2 rounded-md bg-brand-50 px-3 py-2 text-sm text-slate-800" data-testid="card-banner">
          <span>{f.card ? `Showing: ${CARD_LABELS[f.card]}.` : 'Showing a range of dates.'}</span>
          <Button type="button" size="sm" variant="ghost" onClick={() => set({ card: '', from: '', to: '' })}>Show one day instead</Button>
        </p>
      )}
      <section aria-label="Filters" className="space-y-2 rounded-md border border-slate-200 bg-white p-3" data-testid="class-list-filters">
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Choose the day">
          <Button type="button" size="sm" variant="outline" onClick={() => set({ date: addDays(f.date, -1), from: '', to: '', card: '' })}>Yesterday</Button>
          <Button type="button" size="sm" variant="outline" onClick={() => set({ date: todayIso(), from: '', to: '', card: '' })}>Today</Button>
          <Button type="button" size="sm" variant="outline" onClick={() => set({ date: addDays(f.date, 1), from: '', to: '', card: '' })}>Tomorrow</Button>
          <span className="w-44"><Input aria-label="Choose a date" type="date" className="h-9" value={f.date} onChange={(e) => e.target.value && set({ date: e.target.value, from: '', to: '', card: '' })} /></span>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <label className="text-sm"><span className="mb-1 block text-slate-700">Student name or student ID</span><Input value={f.studentQuery} onChange={(e) => set({ studentQuery: e.target.value })} /></label>
          <label className="text-sm"><span className="mb-1 block text-slate-700">Mentor</span><Select value={f.mentorUserId} onChange={(e) => set({ mentorUserId: e.target.value })}><option value="">All Mentors</option>{[...known.mentors].map(([id, n]) => <option key={id} value={id}>{n}</option>)}</Select></label>
          <label className="text-sm"><span className="mb-1 block text-slate-700">Tutor</span><Select value={f.tutorProfileId} onChange={(e) => set({ tutorProfileId: e.target.value })}><option value="">All tutors</option>{[...known.tutors].map(([id, n]) => <option key={id} value={id}>{n}</option>)}</Select></label>
          <label className="text-sm"><span className="mb-1 block text-slate-700">Subject</span><Select value={f.subjectId} onChange={(e) => set({ subjectId: e.target.value })}><option value="">All subjects</option>{[...known.subjects].map(([id, n]) => <option key={id} value={id}>{n}</option>)}</Select></label>
          <label className="text-sm"><span className="mb-1 block text-slate-700">Class status</span><Select value={f.state} onChange={(e) => set({ state: e.target.value })}><option value="">Any</option>{STATE_CHOICES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></label>
        </div>
        {filtered && <Button type="button" size="sm" variant="ghost" onClick={() => set({ mentorUserId: '', studentQuery: '', tutorProfileId: '', subjectId: '', state: '' })}>Clear the filters</Button>}
      </section>
      {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {!data && !error && <p className="text-sm text-slate-500">Loading the classes</p>}
      {data && data.rows.length === 0 && <p className="rounded-md border border-dashed border-slate-300 p-3 text-sm text-slate-500" data-testid="no-classes">No classes {filtered ? 'match these filters' : 'are scheduled'} on this date.</p>}
      {data && data.rows.length > 0 && (
        <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
          <table className="min-w-full text-left text-sm" data-testid="class-table">
            <caption className="sr-only">Classes from {f.from || f.date} to {f.to || f.date}</caption>
            <thead className="bg-slate-50 text-xs text-slate-600"><tr>{['Time', 'Student', 'Subject', 'Tutor', 'Mentor', 'Status', 'Consumption', ''].map((h, i) => <th key={`${h}-${i}`} scope="col" className="px-2 py-1.5 font-medium">{h}</th>)}</tr></thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.key} className="border-t border-slate-100" data-testid="class-row" data-state={r.state}>
                  <td className="px-2 py-1.5 whitespace-nowrap">{f.from || f.to ? `${r.date}, ` : ''}{timeLabel(r)}</td>
                  <td className="px-2 py-1.5">{r.studentName}{r.studentId ? <span className="ml-1 text-xs text-slate-500">{r.studentId}</span> : null}</td>
                  <td className="px-2 py-1.5">{r.subjectName}</td>
                  <td className="px-2 py-1.5">{r.tutorName}</td>
                  <td className="px-2 py-1.5">{r.mentorName ?? 'Not assigned'}</td>
                  <td className="px-2 py-1.5"><Badge variant={STATE_TONE[r.state] ?? 'default'}>{r.stateLabel}</Badge></td>
                  <td className="px-2 py-1.5">{r.consumption === 'CONSUMED' ? 'Consumed' : 'Not consumed'}</td>
                  <td className="px-2 py-1.5 text-right"><Button type="button" size="sm" variant="outline" onClick={() => setOpen(open === r.key ? null : r.key)}>{open === r.key ? 'Close' : 'Open'}</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && data.pages > 1 && (
        <div className="flex items-center gap-2 text-sm" role="navigation" aria-label="Pages">
          <Button type="button" size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
          <span>Page {data.page} of {data.pages}, {data.total} classes</span>
          <Button type="button" size="sm" variant="outline" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>Next</Button>
        </div>
      )}
      {open && <ClassWorkspaceDrawer role="MENTOR" classKey={open} onClose={() => setOpen(null)} onChanged={() => void load()} />}
    </div>
  );
}
