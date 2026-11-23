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
import { getTutorHistory, getTutorProfile, listHrNotes, removeQualification } from '../actions';
import { DEFERRED_TABS, GENDERS, MARITAL_STATUSES, STATUS_VARIANT, TUTOR_STATUSES, formatAddress, visibleTabs, type ProfileTab } from '../constants';
import { EditProfileDialog, NoteDialog, QualificationDialog, StatusDialog } from '../_components/TutorDialogs';
import { cn } from '@/lib/utils';

const labelOf = (list: readonly { value: string; label: string }[], v?: string | null) => list.find((x) => x.value === v)?.label ?? '';

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-3 py-2 text-sm">
      <dt className="text-slate-500">{k}</dt>
      <dd className="col-span-2 text-slate-900 break-words">{v || <span className="text-slate-400">—</span>}</dd>
    </div>
  );
}

type Dlg = null | { kind: 'edit' | 'status' | 'qualification' | 'note'; item?: any };

export default function TutorProfilePage() {
  const { id } = useParams<{ id: string }>();
  const { hasPermission } = usePermissions();
  const [t, setT] = useState<any>(null);
  const [tab, setTab] = useState<ProfileTab>('Profile');
  const [notes, setNotes] = useState<any[] | null>(null);
  const [history, setHistory] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dlg, setDlg] = useState<Dlg>(null);
  const canRead = hasPermission('tutor_hr.profile.read');

  const load = useCallback(async () => {
    if (!canRead) return;
    const r = await getTutorProfile(id);
    if (r.ok) { setT(r.data); setError(null); } else setError(r.message);
  }, [id, canRead]);
  useEffect(() => { load(); }, [load]);

  // HR-only data is fetched only when that tab is opened, and only for viewers allowed to see it.
  useEffect(() => {
    if (!t?.access.canSeeNotes) return;
    if (tab === 'HR Internal Notes') listHrNotes(id).then((r) => (r.ok ? setNotes(r.data) : setError(r.message)));
    if (tab === 'History & Status') getTutorHistory(id).then((r) => (r.ok ? setHistory(r.data) : setError(r.message)));
  }, [tab, id, t?.access.canSeeNotes]);

  if (!canRead) return <NoAccess what="tutor profiles" />;
  if (!t) return error ? <ErrorNote message={error} /> : <Card><SkeletonRows rows={6} /></Card>;

  const canManage = t.access.canManage;
  const p = t.personal ?? {};
  const name = `${t.employee.firstName} ${t.employee.lastName}`.trim();
  const close = () => setDlg(null);
  const dialog = {
    onClose: close,
    onDone: (m?: string) => {
      setNotice(m ?? null); load();
      if (tab === 'HR Internal Notes') listHrNotes(id).then((r) => r.ok && setNotes(r.data));
    },
  };
  const removeQ = async (q: any) => {
    if (!window.confirm(`Remove "${q.name}"? It stays in the history.`)) return;
    const r = await removeQualification(t.id, q.id);
    if (r.ok) dialog.onDone('Qualification removed'); else setError(r.message);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <Link href="/tutor-hr/tutors" aria-label="Back to tutors" className="mt-1.5 text-slate-500 hover:text-slate-900"><ArrowLeft className="w-5 h-5" /></Link>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{name}</h1>
            <Badge variant="info">{t.tutorId}</Badge>
            <Badge variant={STATUS_VARIANT[t.status] ?? 'default'}>{labelOf(TUTOR_STATUSES, t.status)}</Badge>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Coordinator: {t.coordinator?.email ?? 'Not Assigned Yet'} · Joined {fmtDate(t.verifiedAt)}{t.verifiedBy ? ` (verified by ${t.verifiedBy.email})` : ''}
          </p>
        </div>
        {canManage && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setDlg({ kind: 'status' })}>Change status</Button>
            <Button onClick={() => setDlg({ kind: 'edit' })}>Edit profile</Button>
          </div>
        )}
      </div>

      {notice && <div role="status" className="rounded-md border border-brand-200 bg-brand-50 px-3 py-2 text-sm text-brand-800">{notice}</div>}
      <ErrorNote message={error} />
      {t.gaps.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">Profile incomplete: {t.gaps.join(', ')}.</div>
      )}

      <div role="tablist" aria-label="Tutor profile sections" className="flex gap-1 border-b border-slate-200 overflow-x-auto">
        {visibleTabs(t.access.canSeeNotes).map((x) => (
          <button key={x} role="tab" aria-selected={tab === x} onClick={() => setTab(x)}
            className={cn('px-4 h-10 text-sm font-medium border-b-2 -mb-px whitespace-nowrap',
              tab === x ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-600 hover:text-slate-900',
              DEFERRED_TABS.includes(x) && 'text-slate-400')}>
            {x}
          </button>
        ))}
      </div>

      {tab === 'Profile' && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <Card>
            <CardHeader><CardTitle>Personal and contact</CardTitle></CardHeader>
            <CardContent>
              <dl className="divide-y divide-slate-100">
                <Row k="Tutor ID" v={t.tutorId} />
                <Row k="Phone" v={t.employee.phone} />
                <Row k="Email (login)" v={t.employee.user.email} />
                <Row k="Gender" v={labelOf(GENDERS, p.gender)} />
                <Row k="Marital status" v={labelOf(MARITAL_STATUSES, p.maritalStatus)} />
                <Row k="Permanent address" v={formatAddress(p, 'perm')} />
                <Row k="Current address" v={p.currentSameAsPermanent ? 'Same as permanent address' : formatAddress(p, 'cur')} />
              </dl>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Emergency contacts</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <p className="text-xs text-amber-800">{t.emergencyContactAlert}</p>
              {['PRIMARY', 'SECONDARY'].map((k) => {
                const c = t.emergencyContacts.find((x: any) => x.kind === k);
                return (
                  <dl key={k} className="divide-y divide-slate-100">
                    <Row k={k === 'PRIMARY' ? 'Primary' : 'Second (optional)'} v={c ? `${c.name} · ${c.phone} · ${c.relationship}` : k === 'PRIMARY' ? <span className="text-red-700">Not added (compulsory)</span> : ''} />
                  </dl>
                );
              })}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Bank details</CardTitle></CardHeader>
            <CardContent>
              <dl className="divide-y divide-slate-100">
                <Row k="Account holder" v={p.bankAccountHolder} />
                <Row k="Bank" v={p.bankName} />
                <Row k="Branch" v={p.bankBranch} />
                <Row k="Account number" v={p.bankAccountNumber} />
                <Row k="IFSC" v={p.bankIfsc} />
              </dl>
              {!t.access.bankFullyVisible && p.bankAccountNumber && <p className="text-xs text-slate-500 mt-1">Only HR Staff and HR Head see the full account number.</p>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <CardTitle>Educational qualifications</CardTitle>
                {canManage && <Button size="sm" variant="outline" onClick={() => setDlg({ kind: 'qualification' })}>Add</Button>}
              </div>
            </CardHeader>
            <CardContent>
              {t.qualifications.length === 0 ? <p className="text-sm text-slate-500">None recorded.</p> : (
                <ul className="divide-y divide-slate-100">
                  {t.qualifications.map((q: any) => (
                    <li key={q.id} className="py-2 text-sm flex flex-wrap items-center justify-between gap-2">
                      <span><span className="font-medium text-slate-900">{q.name}</span> · {q.institution}{q.yearOfCompletion ? ` · ${q.yearOfCompletion}` : ''}</span>
                      {canManage && (
                        <span className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => setDlg({ kind: 'qualification', item: q })}>Edit</Button>
                          <Button size="sm" variant="outline" onClick={() => removeQ(q)}>Remove</Button>
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-xs text-slate-500 mt-2">Certificate upload will be added later.</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Teaching</CardTitle></CardHeader>
            <CardContent>
              <dl className="divide-y divide-slate-100">
                <Row k="Subjects" v={t.subjects.map((x: any) => x.name).join(', ')} />
                <Row k="Grades" v={t.grades.map((x: any) => x.name).join(', ')} />
                <Row k="Syllabi" v={t.curricula.map((x: any) => x.name).join(', ')} />
              </dl>
            </CardContent>
          </Card>
          {t.hiring && (
            <Card>
              <CardHeader><CardTitle>From Hiring</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <dl className="divide-y divide-slate-100">
                  <Row k="English communication" v={t.hiring.englishRating ? `${t.hiring.englishRating}/5` : ''} />
                  <Row k="Hiring remarks" v={t.hiring.hiringRemarks} />
                  <Row k="Mother tongue" v={t.hiring.motherTongue} />
                  <Row k="Languages" v={t.hiring.languages.join(', ')} />
                </dl>
                {t.hiring.demoEvaluations.map((e: any) => (
                  <div key={e.id} className="rounded-md bg-slate-50 p-3 text-sm space-y-1">
                    <p className="text-xs text-slate-500">Live demo evaluation · {fmtDateTime(e.evaluatedAt)} · {e.evaluatedBy?.email}</p>
                    <p><span className="text-slate-500">Teaching methods:</span> {e.teachingMethods}</p>
                    <p><span className="text-slate-500">Technical skills:</span> {e.technicalSkills}</p>
                    {e.remarks && <p><span className="text-slate-500">Demo remarks:</span> {e.remarks}</p>}
                  </div>
                ))}
                <Link className="text-sm text-brand-700 hover:underline" href={`/tutor-hr/hiring/candidates/${t.hiring.candidateId}`}>Open hiring record {t.hiring.candidateBusinessId}</Link>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {DEFERRED_TABS.includes(tab) && (
        <Card><Empty title={`${tab}: not available yet`} hint={tab === 'Salary' ? 'Salary is built together with the Pay Slab module.' : 'This section needs class records from Mentoring and will be added in a later phase.'} /></Card>
      )}

      {tab === 'HR Internal Notes' && t.access.canSeeNotes && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle>HR Internal Notes</CardTitle>
              <Button size="sm" onClick={() => setDlg({ kind: 'note' })}>Add note</Button>
            </div>
            <p className="text-xs text-slate-500">Confidential: HR Staff and HR Head only. Tutors, coordinators and the Tutor Head cannot see these.</p>
          </CardHeader>
          {notes === null ? <SkeletonRows rows={3} /> : notes.length === 0 ? <Empty title="No notes yet" /> : (
            <ul className="divide-y divide-slate-100">
              {notes.map((n) => (
                <li key={n.id} className="p-4 text-sm space-y-1">
                  <div className="flex flex-wrap justify-between gap-2">
                    <span className="text-slate-500">{fmtDateTime(n.createdAt)} · {n.createdBy.email}{n.editedAt ? ` · edited ${fmtDateTime(n.editedAt)}` : ''}</span>
                    <Button size="sm" variant="outline" onClick={() => setDlg({ kind: 'note', item: n })}>Edit</Button>
                  </div>
                  <p className="whitespace-pre-wrap text-slate-900">{n.body}</p>
                  {n.revisions.length > 0 && (
                    <details className="text-xs text-slate-600">
                      <summary className="cursor-pointer">Earlier versions ({n.revisions.length})</summary>
                      <ul className="mt-1 space-y-1">
                        {n.revisions.map((r: any) => (
                          <li key={r.id}><span className="text-slate-500">Replaced {fmtDateTime(r.editedAt)} by {r.editedBy.email}:</span> <span className="whitespace-pre-wrap">{r.previousBody}</span></li>
                        ))}
                      </ul>
                    </details>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {tab === 'History & Status' && t.access.canSeeHistory && (
        <Card>
          <CardHeader><CardTitle>History &amp; Status</CardTitle><p className="text-xs text-slate-500">Complete journey from hiring onward. HR team only.</p></CardHeader>
          {history === null ? <SkeletonRows rows={4} /> : history.length === 0 ? <Empty title="No history yet" /> : (
            <ol className="divide-y divide-slate-100">
              {history.map((h, i) => (
                <li key={i} className="p-4 text-sm">
                  <div className="flex flex-wrap justify-between gap-2">
                    <span><Badge variant="default">{h.area}</Badge> <span className="font-medium text-slate-900 ml-1">{h.title}</span></span>
                    <span className="text-slate-500">{fmtDateTime(h.at)}{h.by ? ` · ${h.by}` : ''}</span>
                  </div>
                  {h.detail && <p className="text-slate-600 mt-0.5">{h.detail}</p>}
                </li>
              ))}
            </ol>
          )}
        </Card>
      )}

      {canManage && <EditProfileDialog tutor={t} isOpen={dlg?.kind === 'edit'} {...dialog} />}
      {canManage && <StatusDialog id={t.id} current={t.status} isOpen={dlg?.kind === 'status'} {...dialog} />}
      {canManage && <QualificationDialog id={t.id} existing={dlg?.kind === 'qualification' ? dlg.item : undefined} isOpen={dlg?.kind === 'qualification'} {...dialog} />}
      {t.access.canSeeNotes && <NoteDialog id={t.id} note={dlg?.kind === 'note' ? dlg.item : undefined} isOpen={dlg?.kind === 'note'} {...dialog} />}
    </div>
  );
}
