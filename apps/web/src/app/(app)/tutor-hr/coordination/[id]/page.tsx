"use client";

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { usePermissions } from '@/components/providers/AuthProvider';
import { fmtDate, fmtDateTime } from '../../hiring/constants';
import { Empty, ErrorNote, NoAccess, SkeletonRows } from '../../hiring/_components/kit';
import { getCoordinationTutor } from '../actions';
import { OBSERVATION_VARIANT, assignmentText, observationLabel } from '../constants';
import { AssignDialog, DeleteObservationDialog, ObservationDialog } from '../_components/CoordinationDialogs';

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-3 py-2 text-sm">
      <dt className="text-slate-500">{k}</dt>
      <dd className="col-span-2 text-slate-900 break-words">{v || <span className="text-slate-400">—</span>}</dd>
    </div>
  );
}

/** Coordinator view of one assigned tutor: list fields, observations, assignment history only. */
export default function CoordinationTutorPage() {
  const { id } = useParams<{ id: string }>();
  const { hasPermission } = usePermissions();
  const canRead = hasPermission('tutor_coordination.read');
  const canObserve = hasPermission('tutor_coordination.observe');
  const [d, setD] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dlg, setDlg] = useState<null | { kind: 'observe' | 'edit' | 'delete' | 'assign'; item?: any }>(null);

  const load = useCallback(async () => {
    if (!canRead) return;
    const r = await getCoordinationTutor(id);
    if (r.ok) { setD(r.data); setError(null); } else setError(r.message);
  }, [id, canRead]);
  useEffect(() => { load(); }, [load]);

  if (!canRead) return <NoAccess what="Tutor Coordination" />;
  if (!d) return error ? <ErrorNote message={error} /> : <Card><SkeletonRows rows={5} /></Card>;
  const t = d.tutor;
  const head = d.canManage;
  const dialog = { onClose: () => setDlg(null), onDone: (m?: string) => { setNotice(m ?? null); load(); } };

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <Link href="/tutor-hr/coordination" aria-label="Back to coordination" className="mt-1.5 text-slate-500 hover:text-slate-900"><ArrowLeft className="w-5 h-5" /></Link>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{t.name}</h1>
            <Badge variant="info">{t.tutorId}</Badge>
            {t.observationStatus && <Badge variant={OBSERVATION_VARIANT[t.observationStatus]}>{observationLabel(t.observationStatus)} this month</Badge>}
          </div>
          <p className="text-sm text-slate-500 mt-1">Coordinator: {t.coordinator?.email ?? 'Not Assigned Yet'}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canObserve && <Button onClick={() => setDlg({ kind: 'observe' })}>Add observation</Button>}
          {head && t.status !== 'DISCONTINUED' && <Button variant="outline" onClick={() => setDlg({ kind: 'assign' })}>{t.coordinator ? 'Reassign' : 'Assign'}</Button>}
        </div>
      </div>
      {notice && <div role="status" className="rounded-md border border-brand-200 bg-brand-50 px-3 py-2 text-sm text-brand-800">{notice}</div>}
      <ErrorNote message={error} />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Card className="xl:col-span-1">
          <CardHeader><CardTitle>Tutor</CardTitle></CardHeader>
          <CardContent>
            <dl className="divide-y divide-slate-100">
              <Row k="Phone" v={t.phone} />
              <Row k="Email" v={t.email} />
              <Row k="Subjects" v={t.subjects.join(', ')} />
              <Row k="Grades" v={t.grades.join(', ')} />
              <Row k="Students per grade" v={t.studentsPerGrade} />
              <Row k="Qualification" v={t.qualifications.join(', ')} />
              <Row k="Joined" v={fmtDate(t.joinedAt)} />
              <Row k="Last observed" v={fmtDate(t.lastObservedAt)} />
            </dl>
          </CardContent>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader><CardTitle>Class observations</CardTitle></CardHeader>
          {d.observations.length === 0 ? <Empty title="No observations yet" /> : (
            <ul className="divide-y divide-slate-100">
              {d.observations.map((o: any) => (
                <li key={o.id} className={`p-4 text-sm space-y-1 ${o.hiddenAt ? 'opacity-60' : ''}`}>
                  <div className="flex flex-wrap justify-between gap-2">
                    <span className="font-medium text-slate-900">Observed {fmtDateTime(o.observedAt)}</span>
                    <span className="text-slate-500">by {o.author.email}{o.editedAt ? ` · edited ${fmtDateTime(o.editedAt)}` : ''}</span>
                  </div>
                  {o.positiveFeedback && <p><span className="text-emerald-700 font-medium">Positive:</span> <span className="whitespace-pre-wrap">{o.positiveFeedback}</span></p>}
                  {o.negativeFeedback && <p><span className="text-red-700 font-medium">Negative:</span> <span className="whitespace-pre-wrap">{o.negativeFeedback}</span></p>}
                  {o.hiddenAt && <p className="text-xs text-red-700">Deleted {fmtDateTime(o.hiddenAt)} by {o.hiddenBy?.email}: {o.hiddenReason}</p>}
                  {head && o.revisions?.length > 0 && (
                    <details className="text-xs text-slate-600">
                      <summary className="cursor-pointer">Edit history ({o.revisions.length})</summary>
                      <ul className="mt-1 space-y-1">
                        {o.revisions.map((r: any) => (
                          <li key={r.id}>{fmtDateTime(r.editedAt)} by {r.editedBy.email}: was {fmtDateTime(r.previousObservedAt)}; positive “{r.previousPositiveFeedback ?? ''}”; negative “{r.previousNegativeFeedback ?? ''}”</li>
                        ))}
                      </ul>
                    </details>
                  )}
                  {head && !o.hiddenAt && (
                    <div className="flex gap-2 pt-1">
                      <Button size="sm" variant="outline" onClick={() => setDlg({ kind: 'edit', item: o })}>Edit</Button>
                      <Button size="sm" variant="outline" onClick={() => setDlg({ kind: 'delete', item: o })}>Delete</Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="xl:col-span-3">
          <CardHeader><CardTitle>Coordinator assignment history</CardTitle></CardHeader>
          {d.assignmentHistory.length === 0 ? <Empty title="Never assigned" /> : (
            <ul className="divide-y divide-slate-100">
              {d.assignmentHistory.map((h: any) => (
                <li key={h.id} className="p-4 text-sm flex flex-wrap justify-between gap-2">
                  <span><span className="font-medium text-slate-900">{assignmentText(h)}</span>{h.reason ? <span className="text-slate-600"> · {h.reason}</span> : null}</span>
                  <span className="text-slate-500">{fmtDateTime(h.changedAt)} · {h.changedBy.email}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      <p className="text-xs text-slate-500">Demo and Mentor department feedback and complaints will appear here once the Mentoring records are connected.</p>

      {dlg?.kind === 'observe' && <ObservationDialog tutorId={t.id} tutorName={t.name} isOpen {...dialog} />}
      {dlg?.kind === 'edit' && <ObservationDialog tutorId={t.id} tutorName={t.name} observation={dlg.item} isOpen {...dialog} />}
      {dlg?.kind === 'delete' && <DeleteObservationDialog observation={dlg.item} isOpen {...dialog} />}
      {dlg?.kind === 'assign' && <AssignDialog tutors={[{ id: t.id, name: t.name, coordinator: t.coordinator }]} isOpen {...dialog} />}
    </div>
  );
}
