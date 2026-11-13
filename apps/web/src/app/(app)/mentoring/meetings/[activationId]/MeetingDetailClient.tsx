"use client";

import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

import { CrumbDetail } from '../../MentoringShell';
import { mentoringApi } from '../../mentoring-client';
import { LearningPlanPanel } from '../../students/[id]/LearningPlanPanel';
import { MonthlyReviewPanel } from '../../students/[id]/MonthlyReviewPanel';

const RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1';

/**
 * One student's monthly parent review on its own page, so it has an address, a breadcrumb and a working Back button. The review itself
 * (exam record, goals, remarks, parent communication, next plan, completion) and the learning plan are the existing panels, unchanged.
 */
export function MeetingDetailClient({ activationId, initialView }: { activationId: string; initialView: 'review' | 'plan' }) {
  const [view, setView] = React.useState<'review' | 'plan'>(initialView);
  const [name, setName] = React.useState<string | undefined>(undefined);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let live = true;
    mentoringApi(`/mentoring/students/${encodeURIComponent(activationId)}/review`)
      .then((d) => { if (live) { setName(d?.student?.name); setError(null); } })
      .catch((e) => { if (live) setError(e instanceof Error && e.message ? e.message : 'The meeting could not be opened.'); });
    return () => { live = false; };
  }, [activationId]);

  const pick = (next: 'review' | 'plan') => {
    setView(next);
    window.history.replaceState(window.history.state, '', next === 'plan' ? '?view=plan' : window.location.pathname);
  };

  return (
    <div className="mx-auto max-w-6xl space-y-3" data-testid="meeting-detail">
      <CrumbDetail label={name} />
      <Link href="/mentoring/meetings" className={`inline-flex min-h-9 items-center gap-1 rounded-md px-2 text-sm text-slate-700 hover:bg-slate-100 ${RING}`}><ArrowLeft className="h-4 w-4" aria-hidden="true" />Back to Meetings</Link>
      {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold text-slate-900">{name ? `${name}: monthly review` : 'Monthly review'}</h1>
        <div role="tablist" aria-label="Meeting sections" className="inline-flex overflow-hidden rounded-md border border-slate-300">
          <button type="button" role="tab" aria-selected={view === 'review'} onClick={() => pick('review')} className={`min-h-9 px-3 text-sm ${RING} ${view === 'review' ? 'bg-brand-600 font-semibold text-white' : 'bg-white text-slate-700'}`}>Monthly review</button>
          <button type="button" role="tab" aria-selected={view === 'plan'} onClick={() => pick('plan')} className={`min-h-9 border-l border-slate-300 px-3 text-sm ${RING} ${view === 'plan' ? 'bg-brand-600 font-semibold text-white' : 'bg-white text-slate-700'}`}>Learning plan</button>
        </div>
      </div>
      {view === 'review' ? <MonthlyReviewPanel activationId={activationId} /> : <LearningPlanPanel activationId={activationId} />}
    </div>
  );
}
