"use client";

import * as React from 'react';
import { Button } from '@/components/ui/Button';
import { mentoringApi } from '../../mentoring-client';
import { Draft, GROUP_ORDER, GROUP_TITLES, ProfileField, SOURCE_LABELS, displayOf, draftOf, isDirty, problemsOf, submitProfile } from '../../profile-form';

const INPUT = 'block w-full min-h-11 rounded-md border bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500';

/**
 * The profile edit form for an activated student, in a dialog. Student and parent details are separate groups. Only fields that changed are sent, each
 * with the value the Mentor was looking at, so the API can refuse a save over someone else's newer edit. Unsaved text is kept when a check fails, and
 * leaving with unsaved changes asks first. The API checks the permission and every value again.
 */
export function EditProfileDialog({ activationId, fields, onClose, onSaved }: { activationId: string; fields: ProfileField[]; onClose: () => void; onSaved: (changed: string[]) => void }) {
  const [draft, setDraft] = React.useState<Draft>(() => draftOf(fields));
  const [reason, setReason] = React.useState('');
  const [touched, setTouched] = React.useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [confirmLeave, setConfirmLeave] = React.useState(false);
  const firstRef = React.useRef<HTMLElement | null>(null);
  const gate = React.useRef({ busy: false }); // set before the request starts, so a second click in the same moment cannot send twice

  const problems = problemsOf(fields, draft);
  const dirty = isDirty(fields, draft);
  const requestClose = React.useCallback(() => { if (saving) return; if (dirty) setConfirmLeave(true); else onClose(); }, [dirty, saving, onClose]);

  React.useEffect(() => { firstRef.current?.focus(); }, []);
  React.useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') requestClose(); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [requestClose]);
  // The browser warns before the tab is closed with unsaved changes.
  React.useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const save = async () => {
    setSubmitted(true);
    setError(null);
    setSaving(true);
    const r = await submitProfile({ fields, draft, reason }, gate.current, (body) => mentoringApi(`/mentoring/students/${activationId}/profile`, 'PATCH', body));
    if (r.kind !== 'busy') setSaving(false);
    if (r.kind === 'saved') onSaved(r.changed);
    else if (r.kind !== 'busy') setError(r.message);
  };

  const grouped = GROUP_ORDER.map((g) => [g, fields.filter((f) => f.group === g)] as const).filter(([, list]) => list.length > 0);
  let first = true;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 sm:items-center" onClick={requestClose} data-testid="edit-profile-dialog">
      <div role="dialog" aria-modal="true" aria-labelledby="edit-profile-title" onClick={(e) => e.stopPropagation()}
        className="flex h-full max-h-full w-full flex-col bg-white shadow-xl sm:h-auto sm:max-h-[90vh] sm:max-w-3xl sm:rounded-lg">
        <div className="flex items-start gap-3 border-b border-slate-200 p-4">
          <div className="mr-auto">
            <h2 id="edit-profile-title" className="text-lg font-semibold text-slate-900">Edit profile</h2>
            <p className="text-sm text-slate-600">Fields marked * are required. Each change keeps the original Sales value and is recorded in the audit history.</p>
          </div>
          <button type="button" onClick={requestClose} aria-label="Close the editor" className="min-h-11 min-w-11 rounded-md border border-slate-300 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">Close</button>
        </div>

        <form className="flex-1 space-y-6 overflow-y-auto p-4" noValidate onSubmit={(e) => { e.preventDefault(); void save(); }}>
          {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800" data-testid="edit-profile-error">{error}</p>}
          {grouped.map(([group, list]) => (
            <fieldset key={group} className="space-y-3">
              <legend className="mb-1 text-sm font-semibold text-slate-900">{GROUP_TITLES[group]}</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                {list.map((f) => {
                  const id = `pf-${f.key}`;
                  const shown = (touched[f.key] || submitted) ? problems[f.key] : undefined;
                  const wide = f.type === 'TEXTAREA';
                  const ref = first ? ((el: HTMLElement | null) => { firstRef.current = el; }) : undefined;
                  first = false;
                  const common = {
                    id, 'aria-invalid': shown ? true : undefined, 'aria-describedby': shown ? `${id}-err` : `${id}-hint`, disabled: saving,
                    onBlur: () => setTouched((t) => ({ ...t, [f.key]: true })),
                    className: `${INPUT} ${shown ? 'border-red-500' : 'border-slate-300'}`,
                  };
                  const set = (v: string) => setDraft((d) => ({ ...d, [f.key]: v }));
                  return (
                    <div key={f.key} className={wide ? 'sm:col-span-2' : ''}>
                      <label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-800">{f.label}{f.required && <span aria-hidden="true"> *</span>}{f.required && <span className="sr-only"> (required)</span>}</label>
                      {f.type === 'TEXTAREA'
                        ? <textarea {...common} ref={ref as React.Ref<HTMLTextAreaElement>} rows={3} value={draft[f.key] ?? ''} onChange={(e) => set(e.target.value)} maxLength={f.maxLength ?? undefined} />
                        : f.type === 'SELECT'
                          ? <select {...common} ref={ref as React.Ref<HTMLSelectElement>} value={draft[f.key] ?? ''} onChange={(e) => set(e.target.value)}>
                              <option value="">{textOf(f.value) ? 'Choose an option' : 'Not set'}</option>
                              {(f.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
                            </select>
                          : <input {...common} ref={ref as React.Ref<HTMLInputElement>} type={f.type === 'DATE' ? 'date' : f.type === 'PHONE' ? 'tel' : 'text'} inputMode={f.type === 'PHONE' ? 'tel' : undefined}
                              autoComplete="off" value={draft[f.key] ?? ''} onChange={(e) => set(e.target.value)} maxLength={f.maxLength ?? undefined} min={f.type === 'DATE' ? f.minDate ?? undefined : undefined} max={f.type === 'DATE' && f.maxDate === 'TODAY' ? new Date().toISOString().slice(0, 10) : undefined} />}
                      {shown
                        ? <p id={`${id}-err`} role="alert" className="mt-1 text-xs text-red-700">{shown}</p>
                        : <p id={`${id}-hint`} className="mt-1 text-xs text-slate-600">{SOURCE_LABELS[f.source] ?? f.source}{f.source !== 'SALES' && f.salesValue ? ` · Sales had: ${displayOf(f.salesValue)}` : ''}</p>}
                    </div>
                  );
                })}
              </div>
            </fieldset>
          ))}
          <div>
            <label htmlFor="pf-reason" className="mb-1 block text-sm font-medium text-slate-800">Reason for the change (optional)</label>
            <input id="pf-reason" className={`${INPUT} border-slate-300`} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} disabled={saving} />
          </div>
        </form>

        {confirmLeave && (
          <div role="alertdialog" aria-labelledby="leave-title" className="border-t border-amber-200 bg-amber-50 p-4" data-testid="discard-confirm">
            <p id="leave-title" className="text-sm font-medium text-amber-900">Discard your unsaved changes?</p>
            <div className="mt-2 flex gap-2">
              <Button type="button" size="sm" variant="outline" className="min-h-11" onClick={() => setConfirmLeave(false)}>Keep editing</Button>
              <Button type="button" size="sm" variant="danger" className="min-h-11" onClick={onClose}>Discard changes</Button>
            </div>
          </div>
        )}

        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 p-4">
          <Button type="button" variant="outline" className="min-h-11" onClick={requestClose} disabled={saving}>Cancel</Button>
          <Button type="button" className="min-h-11" onClick={() => void save()} isLoading={saving} disabled={saving || !dirty} data-testid="save-profile">Save changes</Button>
        </div>
      </div>
    </div>
  );
}

const textOf = (v: unknown) => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');
