"use client";

import * as React from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { AvailabilityWindow } from '../../tutor-availability';
import { AssignmentView, CandidateList, SESSION_TONE, TutorSessionView, TutorTools, TutorView, needsHours } from '../../tutor-types';
import { NeededTime, TutorAvailabilityEditor } from './TutorAvailabilityEditor';

type Tone = 'green' | 'amber' | 'red' | 'neutral';

const TONE: Record<Tone, string> = {
  green: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  amber: 'border-amber-200 bg-amber-50 text-amber-800',
  red: 'border-red-200 bg-red-50 text-red-800',
  neutral: 'border-slate-200 bg-slate-50 text-slate-700',
};
const DOT: Record<Tone, string> = { green: 'bg-emerald-500', amber: 'bg-amber-500', red: 'bg-red-500', neutral: 'bg-slate-400' };

function Avatar({ name, initials, photoUrl, size = 'md' }: { name: string; initials: string; photoUrl: string | null; size?: 'sm' | 'md' }) {
  const box = size === 'sm' ? 'h-8 w-8 text-xs' : 'h-10 w-10 text-sm';
  // eslint-disable-next-line @next/next/no-img-element
  if (photoUrl) return <img src={photoUrl} alt={name} className={`${box} shrink-0 rounded-full object-cover`} />;
  return (
    <span aria-hidden className={`${box} inline-flex shrink-0 items-center justify-center rounded-full bg-brand-100 font-semibold text-brand-800`}>
      {initials}
    </span>
  );
}

function Chip({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${TONE[tone]}`}>{children}</span>;
}

function verdictChip(t: TutorView) {
  switch (t.verdict) {
    case 'FULL':
      return <Chip tone="green">Recommended, fully available</Chip>;
    case 'PARTIAL':
      return <Chip tone="amber">Partial availability, {t.availableCount} of {t.total} sessions available</Chip>;
    case 'NONE':
      return <Chip tone="red">Not available for any session</Chip>;
    default:
      return <Chip tone="neutral">Not eligible</Chip>;
  }
}

function SessionList({ sessions }: { sessions: TutorSessionView[] }) {
  return (
    <ul role="list" className="mt-2 space-y-1">
      {sessions.map((s) => (
        <li key={s.key} className="flex flex-wrap items-baseline gap-x-2 text-xs" data-session-status={s.status}>
          <span aria-hidden className={`mt-1 inline-block h-2 w-2 shrink-0 rounded-full ${DOT[SESSION_TONE[s.status]]}`} />
          <span className="font-medium text-slate-800">{s.label}</span>
          <span className={`rounded border px-1.5 py-px ${TONE[SESSION_TONE[s.status]]}`}>{s.statusLabel}</span>
          {s.status !== 'AVAILABLE' && <span className="text-slate-600">{s.reason}</span>}
        </li>
      ))}
    </ul>
  );
}

interface CardProps {
  tutor: TutorView;
  tools: TutorTools;
  busy: boolean;
  onSelect: (t: TutorView) => void;
  onUpdateHours: (t: TutorView) => void;
}

function TutorCard({ tutor, tools, busy, onSelect, onUpdateHours }: CardProps) {
  const fixable = tutor.verdict !== 'NOT_ELIGIBLE' && tutor.sessions.some((s) => needsHours(s.status));
  return (
    <li className={`rounded-md border p-3 ${tutor.verdict === 'FULL' ? 'border-emerald-300 bg-emerald-50/30' : 'border-slate-200 bg-white'}`} data-tutor={tutor.tutorProfileId} data-verdict={tutor.verdict}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={tutor.name} initials={tutor.initials} photoUrl={tutor.photoUrl} />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900">{tutor.name}</p>
            <p className="text-xs text-slate-600">Teaches {tutor.subjects.join(', ') || 'no subjects listed'}</p>
            <p className="text-xs text-slate-600">Levels: {tutor.levels.join(', ') || 'none listed'}</p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          {verdictChip(tutor)}
          {tutor.isCurrent && <Chip tone="neutral">Current tutor</Chip>}
        </div>
      </div>
      <p className="mt-1 text-xs text-slate-500">Working hours: {tutor.hours}</p>
      {tutor.ineligible && <p className="mt-1 text-xs font-medium text-slate-700">{tutor.ineligible}</p>}
      <SessionList sessions={tutor.sessions} />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" disabled={!tutor.canAssign || !tools.canAssign || busy || tutor.isCurrent} onClick={() => onSelect(tutor)}>
          {tutor.isCurrent ? 'Selected' : 'Select tutor'}
        </Button>
        {fixable && tools.canManageAvailability && (
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => onUpdateHours(tutor)}>Update tutor availability</Button>
        )}
        {fixable && !tools.canManageAvailability && <span className="text-xs text-slate-500">HR staff or the tutor can add the missing working hours.</span>}
        {!tutor.canAssign && tutor.verdict !== 'NOT_ELIGIBLE' && <span className="text-xs text-slate-500">Every session must be available before this tutor can be selected.</span>}
      </div>
    </li>
  );
}

/** The sessions of a tutor that need working hours, as exact times to add. */
function neededTimes(tutor: TutorView): NeededTime[] {
  return tutor.sessions
    .filter((s) => needsHours(s.status))
    .map((s) => ({ dayNumber: s.dayNumber as NeededTime['dayNumber'], startMinute: s.startMinute, endMinute: s.endMinute }));
}

interface ChoicesProps {
  data: CandidateList;
  tools: TutorTools;
  busy: boolean;
  onSelect: (t: TutorView) => void;
  onUpdateHours: (t: TutorView) => void;
}

/** The ranked tutors for one subject: the recommended ones first, then every other tutor with the reason. */
export function TutorChoices({ data, tools, busy, onSelect, onUpdateHours }: ChoicesProps) {
  if (!data.ready) return <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">{data.notReady}</p>;
  const recommended = data.tutors.filter((t) => t.verdict === 'FULL');
  const others = data.tutors.filter((t) => t.verdict !== 'FULL');
  return (
    <div className="space-y-3" data-testid="tutor-choices">
      <p className="text-xs text-slate-600">
        Matched against the saved schedule: {data.sessions.map((s) => s.label).join('; ')}. A tutor can be selected only when every session is available.
      </p>
      {data.tutors.length === 0 && <p className="text-sm text-slate-600">No active tutor teaches {data.subjectName} yet. HR staff can add the subject to a tutor profile.</p>}
      {recommended.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-slate-800">Recommended</h4>
          <ul role="list" className="mt-1 space-y-2">
            {recommended.map((t) => <TutorCard key={t.tutorProfileId} tutor={t} tools={tools} busy={busy} onSelect={onSelect} onUpdateHours={onUpdateHours} />)}
          </ul>
        </div>
      )}
      {recommended.length === 0 && data.tutors.length > 0 && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">No tutor is available for every session. Update the working hours of a tutor, change the schedule, or choose another time.</p>
      )}
      {others.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-slate-800">Other tutors</h4>
          <ul role="list" className="mt-1 space-y-2">
            {others.map((t) => <TutorCard key={t.tutorProfileId} tutor={t} tools={tools} busy={busy} onSelect={onSelect} onUpdateHours={onUpdateHours} />)}
          </ul>
        </div>
      )}
    </div>
  );
}

interface ModalProps {
  subjectId: string;
  subjectName: string;
  tools: TutorTools;
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
}

/** Tutors who teach the subject, ranked against the saved schedule, with the reason for every session that does not fit. */
export function TutorSelectionModal({ subjectId, subjectName, tools, open, onClose, onChanged }: ModalProps) {
  const [data, setData] = React.useState<CandidateList | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [editing, setEditing] = React.useState<{ tutor: TutorView; name: string; windows: AvailabilityWindow[] } | null>(null);

  // Always the latest tools: a reload after saving working hours must not use an older copy.
  const latest = React.useRef(tools);
  latest.current = tools;
  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await latest.current.loadCandidates(subjectId));
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'The tutors could not be loaded. Please try again.');
    }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectId]);

  React.useEffect(() => {
    if (open) {
      setNotice(null);
      setEditing(null);
      void load();
    }
  }, [open, load]);

  const select = async (tutor: TutorView) => {
    setBusy(true);
    setError(null);
    try {
      await tools.assign(subjectId, tutor.tutorProfileId);
      onChanged();
      onClose();
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'The tutor could not be assigned.');
      await load(); // what the Mentor saw may be out of date
    }
    setBusy(false);
  };

  const startEditing = async (tutor: TutorView) => {
    setBusy(true);
    setError(null);
    try {
      const current = await tools.loadAvailability(tutor.tutorProfileId);
      setEditing({ tutor, name: current.name, windows: current.windows });
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'The working hours could not be loaded.');
    }
    setBusy(false);
  };

  return (
    <Modal isOpen={open} onClose={onClose} size="xl">
      <section aria-label={`Select tutor for ${subjectName}`} className="space-y-3 pr-6">
        <h3 className="text-base font-semibold text-slate-900">{subjectName}: select tutor</h3>

        {editing ? (
          <div className="space-y-2">
            <button type="button" className="text-xs text-brand-700 hover:underline" onClick={() => setEditing(null)}>Back to the tutors</button>
            <TutorAvailabilityEditor
              name={editing.name}
              initial={editing.windows}
              needed={neededTimes(editing.tutor)}
              onCancel={() => setEditing(null)}
              onSave={async (windows) => {
                await tools.saveAvailability(editing.tutor.tutorProfileId, windows);
                setEditing(null);
                setNotice(`Working hours for ${editing.name} saved. The tutors below are checked again.`);
                await load();
              }}
            />
          </div>
        ) : (
          <>
            {notice && <p role="status" className="rounded-md bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800">{notice}</p>}
            {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-xs font-medium text-red-700">{error}</p>}
            {loading && <p className="text-sm text-slate-500">Checking tutors</p>}
            {!loading && data && <TutorChoices data={data} tools={tools} busy={busy} onSelect={select} onUpdateHours={startEditing} />}
          </>
        )}
      </section>
    </Modal>
  );
}

interface AssignedProps {
  subjectId: string;
  subjectName: string;
  tools: TutorTools;
  /** The card matches the saved schedule, so tutors can be matched against it. */
  saved: boolean;
}

/** "Assigned tutor" inside a subject card. */
export function AssignedTutor({ subjectId, subjectName, tools, saved }: AssignedProps) {
  const [open, setOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const current: AssignmentView | undefined = tools.assignments.find((a) => a.subjectId === subjectId && a.status !== 'ENDED');
  const needsReview = current?.status === 'NEEDS_REVIEW';

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await tools.remove(subjectId);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'The tutor could not be removed.');
    }
    setBusy(false);
  };

  return (
    <div className="mt-3 rounded-md border border-slate-200 bg-white p-3" data-assigned-tutor={subjectId}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h5 className="text-xs font-semibold uppercase tracking-wide text-slate-600">Assigned tutor</h5>
        {tools.canAssign && saved && (
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => setOpen(true)}>
            {current ? 'Change tutor' : (<><Plus aria-hidden className="mr-1 h-3.5 w-3.5" />Select tutor</>)}
          </Button>
        )}
      </div>

      {current ? (
        <div className="mt-2 flex flex-wrap items-start gap-3">
          <Avatar name={current.tutorName} initials={current.initials} photoUrl={current.photoUrl} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-slate-900">{current.tutorName}</p>
              <Chip tone={needsReview ? 'amber' : 'green'}>{needsReview ? 'Needs review' : 'Confirmed for every session'}</Chip>
            </div>
            <p className="text-xs text-slate-600">Teaches {current.subjects.join(', ') || 'no subjects listed'}. Levels: {current.levels.join(', ') || 'none listed'}.</p>
            <ul role="list" className="mt-1 flex flex-wrap gap-1">
              {current.sessions.map((s) => <li key={s} className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-700">{s}</li>)}
            </ul>
            {needsReview && (
              <div role="alert" className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900" data-testid="tutor-review">
                <p className="font-medium">This tutor no longer fits the schedule.</p>
                {current.reviewDetail?.reason && <p>{current.reviewDetail.reason}</p>}
                {(current.reviewDetail?.sessions ?? []).map((s) => <p key={s.key}>{s.label}: {s.reason}</p>)}
                <p className="mt-1">The earlier booking stays until you choose another tutor, remove this one, or the hours or schedule are fixed.</p>
              </div>
            )}
          </div>
          {tools.canAssign && <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={remove}>Remove tutor</Button>}
        </div>
      ) : (
        <p className="mt-2 text-sm text-slate-500">No tutor selected for {subjectName}.</p>
      )}

      {!saved && tools.canAssign && <p className="mt-2 text-xs text-slate-500">Save the schedule to {current ? 're-check this tutor' : 'choose a tutor'}. Tutors are matched against the saved schedule.</p>}
      {error && <p role="alert" className="mt-2 text-xs font-medium text-red-600">{error}</p>}

      <TutorSelectionModal subjectId={subjectId} subjectName={subjectName} tools={tools} open={open} onClose={() => setOpen(false)} onChanged={() => undefined} />
    </div>
  );
}

