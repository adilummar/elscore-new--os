"use client";

import * as React from 'react';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { usePermissions } from '@/components/providers/AuthProvider';

import { mentoringApi } from '../../mentoring/mentoring-client';
import { ActivityOption, labelProblem, sortedOptions } from '../../mentoring/activity-options-view';

const FIELD = 'block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-500 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-slate-50';

/**
 * The activities a Mentor can record as "given" in a class. Switching one off hides it from new choices but never changes a class that already
 * used it, and the code of an option never changes, so history keeps its words. The API checks the permission again and refuses a duplicate.
 */
export default function MentoringActivitiesPage() {
  const { hasPermission } = usePermissions();
  const canManage = hasPermission('mentoring.template.manage');
  const [rows, setRows] = React.useState<ActivityOption[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [name, setName] = React.useState('');
  const [editing, setEditing] = React.useState<{ id: string; label: string } | null>(null);

  const load = React.useCallback(async () => {
    try {
      setRows(await mentoringApi('/mentoring/activity-options?includeInactive=true'));
      setError(null);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'The activities could not be loaded.');
    }
  }, []);
  React.useEffect(() => { void load(); }, [load]);

  const act = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await fn();
      setNotice(done);
      await load();
      return true;
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'That could not be saved.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const list = rows ? sortedOptions(rows) : [];
  const addProblem = name.trim() ? labelProblem(name, rows ?? [], null) : null;
  const editProblem = editing ? labelProblem(editing.label, rows ?? [], editing.id) : null;

  return (
    <div className="space-y-6" data-testid="mentoring-activities">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Mentoring activities</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-700">The choices a Mentor sees under &quot;Activities given&quot; on a class. Switching an activity off hides it from new choices. Classes that already used it keep it, with the name it had then.</p>
      </div>

      {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {notice && <p role="status" className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</p>}

      {canManage && (
        <Card className="p-4">
          <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); if (name.trim() && !addProblem) void act(() => mentoringApi('/mentoring/activity-options', 'POST', { label: name }), 'The activity is added.').then((ok) => { if (ok) setName(''); }); }}>
            <label className="block min-w-[14rem] flex-1 text-sm"><span className="mb-1 block font-medium text-slate-800">New activity</span><input className={FIELD} maxLength={60} value={name} onChange={(e) => setName(e.target.value)} aria-invalid={!!addProblem} aria-describedby="add-problem" /></label>
            <Button type="submit" disabled={busy || !name.trim() || !!addProblem}>Add activity</Button>
            {addProblem && <p id="add-problem" className="basis-full text-sm text-amber-900">{addProblem}</p>}
          </form>
        </Card>
      )}

      <Card className="p-0">
        {!rows && !error && <p className="p-4 text-sm text-slate-700">Loading the activities</p>}
        {rows && list.length === 0 && <p className="p-4 text-sm text-slate-700">No activities are set up yet.</p>}
        <ul className="divide-y divide-slate-100" aria-label="Activities">
          {list.map((o) => (
            <li key={o.id} className="flex flex-wrap items-center gap-3 px-4 py-3" data-active={o.isActive}>
              {editing?.id === o.id ? (
                <form className="flex min-w-[14rem] flex-1 flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); if (!editProblem) void act(() => mentoringApi(`/mentoring/activity-options/${o.id}`, 'PUT', { label: editing.label }), 'The activity is renamed.').then((ok) => { if (ok) setEditing(null); }); }}>
                  <label className="sr-only" htmlFor={`rename-${o.id}`}>Name of the activity</label>
                  <input id={`rename-${o.id}`} className={`${FIELD} max-w-sm`} maxLength={60} value={editing.label} onChange={(e) => setEditing({ id: o.id, label: e.target.value })} aria-invalid={!!editProblem} />
                  <Button type="submit" size="sm" disabled={busy || !!editProblem}>Save</Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                  {editProblem && <p className="basis-full text-sm text-amber-900">{editProblem}</p>}
                </form>
              ) : (
                <>
                  <div className="min-w-0 flex-1"><p className={`text-sm font-medium ${o.isActive ? 'text-slate-900' : 'text-slate-600'}`}>{o.label}</p><p className="text-xs text-slate-600">{o.isActive ? 'On, shown to Mentors' : 'Off, hidden from new choices'}</p></div>
                  {canManage && (
                    <div className="flex gap-2">
                      <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => setEditing({ id: o.id, label: o.label })}>Rename</Button>
                      <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void act(() => mentoringApi(`/mentoring/activity-options/${o.id}`, 'PUT', { isActive: !o.isActive }), o.isActive ? 'The activity is switched off.' : 'The activity is switched on.')}>{o.isActive ? 'Switch off' : 'Switch on'}</Button>
                    </div>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
        {!canManage && rows && <p className="border-t border-slate-100 px-4 py-3 text-xs text-slate-600">Only the Mentoring Head can change this list.</p>}
      </Card>
    </div>
  );
}
