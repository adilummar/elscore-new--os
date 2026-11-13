"use client";

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

import { ClassWorkspaceDrawer } from '../../ClassWorkspaceDrawer';
import { CrumbDetail } from '../../MentoringShell';
import { STATE_TONE, hoursText } from '../../class-view';
import { actualDiffers, actualText, scheduledText } from '../../classes-view';
import { FOCUS, ListSkeleton, Notice, PANEL, StatusChip, chipTone } from '../../mentoring-ui';
import { call } from '../../workspace-api';
import { longDayLabel } from '../../timetable-view';
import type { WorkspaceData } from '../../workspace-view';

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><dt className="text-xs font-medium text-slate-600">{label}</dt><dd className="mt-0.5 text-sm text-slate-900">{children}</dd></div>;
}

/**
 * One class on its own page: who and when at the top, scheduled time kept apart from actual time, then the four working sections (before
 * class, after class, actual time, verification). The sections and every action in them are the existing class workspace; verifying,
 * returning and consuming stay explicit Mentor actions on the API.
 */
export function ClassDetailClient({ classKey, initialTab }: { classKey: string; initialTab?: string }) {
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
    <div className="mx-auto max-w-5xl space-y-5" data-testid="class-detail">
      <CrumbDetail label={w ? `${w.student.name}, ${w.class.subjectName}` : undefined} />
      <button type="button" onClick={back} className={`inline-flex min-h-9 items-center gap-1 rounded-md px-2 text-sm text-slate-700 hover:bg-slate-100 ${FOCUS}`}><ArrowLeft className="h-4 w-4" aria-hidden="true" />Back to the class list</button>

      {error && <Notice tone="error">{error} <Link className={`rounded font-semibold underline ${FOCUS}`} href="/mentoring/classes">Go to Classes</Link></Notice>}
      {!w && !error && <ListSkeleton rows={2} label="Loading the class" />}

      {w && c && (
        <section aria-label="Class overview" className={`${PANEL} p-5`} data-testid="class-overview">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{w.class.subjectName}, {w.student.name}{/* The API sends the internal student id here, which means nothing to a Mentor, so it is not shown. */}</h1>
              <p className="mt-1 text-sm text-slate-700">{longDayLabel(c.date)}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <StatusChip tone={chipTone(STATE_TONE[c.state])}>{c.stateLabel}</StatusChip>
              <StatusChip tone={c.consumption === 'CONSUMED' ? 'success' : 'neutral'}>{c.consumption === 'CONSUMED' ? 'Consumed' : 'Not consumed'}</StatusChip>
            </div>
          </div>
          <dl className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Fact label="Tutor">{w.tutorName}</Fact>
            <Fact label="Mentor">{w.mentorName ?? 'Not assigned'}</Fact>
            <Fact label="Scheduled time">{scheduledText(c)}</Fact>
            <Fact label="Actual time">{actual ? <span className={actualDiffers(c) ? 'font-semibold text-amber-900' : ''}>{actual}</span> : 'Not reported by the tutor yet'}</Fact>
          </dl>
          {minutes && (
            <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-slate-100 pt-4 sm:grid-cols-4" aria-label="Class minutes">
              <Fact label="Scheduled">{hoursText(minutes.scheduled)}</Fact>
              <Fact label="Reported by the tutor">{minutes.reported != null ? hoursText(minutes.reported) : 'Not reported'}</Fact>
              <Fact label="Verified by the Mentor">{minutes.verified != null ? hoursText(minutes.verified) : 'Not verified'}</Fact>
              <Fact label="Consumed">{hoursText(minutes.consumed)}</Fact>
            </dl>
          )}
        </section>
      )}

      <ClassWorkspaceDrawer role="MENTOR" classKey={classKey} onClose={back} onChanged={() => void load()} layout="sections" initialTab={initialTab} />
    </div>
  );
}
