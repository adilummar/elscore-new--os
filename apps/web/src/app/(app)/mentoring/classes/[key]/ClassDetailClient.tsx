"use client";

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';

import { ClassWorkspaceDrawer } from '../../ClassWorkspaceDrawer';
import { CrumbDetail } from '../../MentoringShell';
import { STATE_TONE, hoursText } from '../../class-view';
import { actualDiffers, actualText, scheduledText } from '../../classes-view';
import { call } from '../../workspace-api';
import { longDayLabel } from '../../timetable-view';
import type { WorkspaceData } from '../../workspace-view';

const RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1';

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><dt className="text-xs text-slate-600">{label}</dt><dd className="text-sm text-slate-900">{children}</dd></div>;
}

/**
 * One class on its own page: who and when at the top, scheduled time kept apart from actual time, then the working sections
 * (before class, after class, Mentor review and verification). The sections and every action in them are the existing class workspace;
 * verifying, returning and consuming stay explicit Mentor actions on the API.
 */
export function ClassDetailClient({ classKey }: { classKey: string }) {
  const router = useRouter();
  const [w, setW] = React.useState<WorkspaceData | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    try {
      setW(await call('MENTOR', `/${classKey}`));
      setError(null);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'The class could not be opened.');
    }
  }, [classKey]);
  React.useEffect(() => { void load(); }, [load]);

  const back = () => (window.history.length > 1 ? router.back() : router.push('/mentoring/classes'));
  const c = w?.class;
  const actual = c ? actualText(c) : null;
  const minutes = w?.review.minutes;

  return (
    <div className="mx-auto max-w-5xl space-y-3" data-testid="class-detail">
      <CrumbDetail label={w ? `${w.student.name}, ${w.class.subjectName}` : undefined} />
      <button type="button" onClick={back} className={`inline-flex min-h-9 items-center gap-1 rounded-md px-2 text-sm text-slate-700 hover:bg-slate-100 ${RING}`}><ArrowLeft className="h-4 w-4" aria-hidden="true" />Back to the class list</button>

      {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error} <Link className="font-medium underline" href="/mentoring/classes">Go to Classes</Link></p>}
      {!w && !error && <div role="status" aria-label="Loading the class" className="h-24 animate-pulse rounded-md bg-slate-100" />}

      {w && c && (
        <section aria-label="Class overview" className="rounded-md border border-slate-200 bg-white p-4" data-testid="class-overview">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h1 className="text-xl font-semibold text-slate-900">{w.class.subjectName}, {w.student.name}{w.student.studentId ? <span className="ml-2 text-sm font-normal text-slate-600">{w.student.studentId}</span> : null}</h1>
              <p className="text-sm text-slate-700">{longDayLabel(c.date)}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant={STATE_TONE[c.state] ?? 'default'}>{c.stateLabel}</Badge>
              <Badge variant={c.consumption === 'CONSUMED' ? 'success' : 'default'}>{c.consumption === 'CONSUMED' ? 'Consumed' : 'Not consumed'}</Badge>
            </div>
          </div>
          <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Fact label="Tutor">{w.tutorName}</Fact>
            <Fact label="Mentor">{w.mentorName ?? 'Not assigned'}</Fact>
            <Fact label="Scheduled time">{scheduledText(c)}</Fact>
            <Fact label="Actual time">{actual ? <span className={actualDiffers(c) ? 'font-medium text-amber-800' : ''}>{actual}</span> : 'Not reported by the tutor yet'}</Fact>
          </dl>
          {minutes && (
            <dl className="mt-3 grid grid-cols-2 gap-3 border-t border-slate-100 pt-3 sm:grid-cols-4" aria-label="Class minutes">
              <Fact label="Scheduled">{hoursText(minutes.scheduled)}</Fact>
              <Fact label="Reported by the tutor">{minutes.reported != null ? hoursText(minutes.reported) : 'Not reported'}</Fact>
              <Fact label="Verified by the Mentor">{minutes.verified != null ? hoursText(minutes.verified) : 'Not verified'}</Fact>
              <Fact label="Consumed">{hoursText(minutes.consumed)}</Fact>
            </dl>
          )}
          {actualDiffers(c) && <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">The tutor reports a different time from the schedule. The approved timetable is not changed; the reported time is kept with the class and its history.</p>}
        </section>
      )}

      <ClassWorkspaceDrawer role="MENTOR" classKey={classKey} onClose={back} onChanged={() => void load()} />
    </div>
  );
}
