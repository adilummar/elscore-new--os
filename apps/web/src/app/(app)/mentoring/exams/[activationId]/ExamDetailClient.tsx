"use client";

import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

import { CrumbDetail } from '../../MentoringShell';
import { mentoringApi } from '../../mentoring-client';
import { ExamsPanel } from '../../students/[id]/ExamsPanel';

const RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1';

/**
 * One student's exams on their own page: schedule, move, mark and close an exam with the existing exam panel, with an address, a breadcrumb
 * and a working Back button. Rescheduling and the exam audit history are the panel's own and are unchanged.
 */
export function ExamDetailClient({ activationId }: { activationId: string }) {
  const [name, setName] = React.useState<string | undefined>(undefined);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let live = true;
    mentoringApi(`/mentoring/students/${encodeURIComponent(activationId)}/exams?limit=1`)
      .then((d) => { if (live) { setName(d?.student?.name); setError(null); } })
      .catch((e) => { if (live) setError(e instanceof Error && e.message ? e.message : 'The exams could not be opened.'); });
    return () => { live = false; };
  }, [activationId]);

  return (
    <div className="mx-auto max-w-6xl space-y-3" data-testid="exam-detail">
      <CrumbDetail label={name} />
      <Link href="/mentoring/exams" className={`inline-flex min-h-9 items-center gap-1 rounded-md px-2 text-sm text-slate-700 hover:bg-slate-100 ${RING}`}><ArrowLeft className="h-4 w-4" aria-hidden="true" />Back to Exams</Link>
      {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <h1 className="text-xl font-semibold text-slate-900">{name ? `${name}: exams` : 'Exams'}</h1>
      <ExamsPanel activationId={activationId} />
    </div>
  );
}
