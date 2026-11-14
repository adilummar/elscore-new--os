"use client";

import * as React from 'react';
import { AlertCircle, Clock, Filter, Plus, RefreshCw, Search, X } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import {
  CATEGORY_CHOICES,
  ComplaintDetail,
  ComplaintDraft,
  ComplaintList,
  ComplaintRow,
  emptyComplaintDraft,
  payloadOfComplaint,
  PRIORITY_CHOICES,
  PRIORITY_TONE,
  SLA_CHOICES,
  SLA_TONE,
  STAGE_TONE,
  STATUS_CHOICES,
  ackText,
  minutesText,
} from '../complaint-view';
import { mentoringApi } from '../mentoring-client';
import { ComplaintDetailView, ComplaintForm, Call } from '../students/[id]/ComplaintsPanel';
import { dayLabel } from '../timetable-view';

const when = (iso: string) => `${dayLabel(iso.slice(0, 10))}, ${iso.slice(11, 16)} UTC`;

interface StudentOption {
  activationId: string;
  studentName: string;
  studentId?: string | null;
}

export function ComplaintsWorkspaceClient({
  canHandle,
  initialData,
}: {
  canHandle: boolean;
  initialData?: ComplaintList;
}) {
  // Filters
  const [studentQuery, setStudentQuery] = React.useState('');
  const [category, setCategory] = React.useState('');
  const [priority, setPriority] = React.useState('');
  const [status, setStatus] = React.useState('');
  const [sla, setSla] = React.useState('');
  const [from, setFrom] = React.useState('');
  const [to, setTo] = React.useState('');

  // Data
  const [data, setData] = React.useState<ComplaintList | null>(initialData ?? null);
  const [students, setStudents] = React.useState<StudentOption[]>([]);
  const [open, setOpen] = React.useState<ComplaintDetail | null>(null);
  const [handlers, setHandlers] = React.useState<Array<{ userId: string; name: string }>>([]);
  const [creating, setCreating] = React.useState<ComplaintDraft | null>(null);
  const [selectedActivationId, setSelectedActivationId] = React.useState('');

  // UI state
  const [loading, setLoading] = React.useState(!initialData);
  const [error, setError] = React.useState<string | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);

  // Query string for fetching complaints
  const buildQuery = React.useCallback(() => {
    const params = new URLSearchParams();
    if (category) params.set('category', category);
    if (priority) params.set('priority', priority);
    if (status) params.set('status', status);
    if (sla) params.set('sla', sla);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    params.set('limit', '200');
    return params.toString() ? `?${params.toString()}` : '';
  }, [category, priority, status, sla, from, to]);

  const loadComplaints = React.useCallback(async () => {
    setLoading(true);
    try {
      const q = buildQuery();
      const res: ComplaintList = await mentoringApi(`/mentoring/complaints${q}`);
      setData(res);
      setError(null);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'The complaints could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [buildQuery]);

  React.useEffect(() => {
    void loadComplaints();
  }, [loadComplaints]);

  // Load students for the "Log complaint" modal
  React.useEffect(() => {
    let live = true;
    mentoringApi('/mentoring/overview/activations?pageSize=200')
      .then((res: { rows: Array<{ activationId: string; studentName: string; studentId?: string | null }> }) => {
        if (live && res?.rows) {
          setStudents(res.rows.map((r) => ({ activationId: r.activationId, studentName: r.studentName, studentId: r.studentId })));
        }
      })
      .catch(() => {
        // Fallback: silence or ignore
      });
    return () => {
      live = false;
    };
  }, []);

  const openComplaint = async (id: string) => {
    setActionError(null);
    try {
      const d: ComplaintDetail = await mentoringApi(`/mentoring/complaints/${id}`);
      setOpen(d);
      if (d.actions.canAssign && handlers.length === 0) {
        setHandlers(await mentoringApi('/mentoring/complaints/handlers'));
      }
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'The complaint could not be opened.');
    }
  };

  const act = async (label: string, run: () => Promise<unknown>, done: string, after?: () => void) => {
    setBusy(label);
    setActionError(null);
    setNotice(null);
    try {
      await run();
      setNotice(done);
      after?.();
      await loadComplaints();
      if (open) await openComplaint(open.id);
    } catch (e) {
      setActionError(e instanceof Error && e.message ? e.message : 'That could not be done.');
    }
    setBusy(null);
  };

  const call: Call = (label, path, body, done, after) =>
    void act(label, () => mentoringApi(path, 'POST', body), done, after);

  const handleCreateSubmit = () => {
    if (!selectedActivationId) {
      setActionError('Choose a student for this complaint.');
      return;
    }
    if (!creating) return;
    void act(
      'create',
      () => mentoringApi(`/mentoring/students/${selectedActivationId}/complaints`, 'POST', payloadOfComplaint(creating)),
      'The complaint is logged. The 2-hour acknowledgement clock is running.',
      () => {
        setCreating(null);
        setSelectedActivationId('');
      },
    );
  };

  // Client-side filtering by student name/ID
  const filteredRows = React.useMemo(() => {
    if (!data?.rows) return [];
    let rows = data.rows;
    if (studentQuery.trim()) {
      const q = studentQuery.toLowerCase().trim();
      rows = rows.filter(
        (r) =>
          r.studentName.toLowerCase().includes(q) ||
          r.parentName.toLowerCase().includes(q) ||
          r.title.toLowerCase().includes(q) ||
          r.number.toLowerCase().includes(q),
      );
    }
    return rows;
  }, [data?.rows, studentQuery]);

  // Metric cards calculations
  const metrics = React.useMemo(() => {
    const allRows = data?.rows || [];
    const total = allRows.length;
    const newCount = allRows.filter((r) => r.status === 'NEW').length;
    const awaitingAck = allRows.filter(
      (r) =>
        r.ack.state !== 'RESOLVED' &&
        (r.ack.state === 'BREACHED' || r.ack.state === 'APPROACHING' || r.ack.state === 'WITHIN_SLA' || !r.ack.acknowledgedAt),
    ).length;
    const inProgress = allRows.filter((r) => r.status === 'IN_PROGRESS' || r.status === 'ASSIGNED').length;
    const waitingParentTutor = allRows.filter(
      (r) => r.status === 'WAITING_FOR_PARENT' || r.status === 'WAITING_FOR_TUTOR',
    ).length;
    const resolved = allRows.filter((r) => r.status === 'RESOLVED').length;
    const reopened = allRows.filter((r) => r.status === 'REOPENED' || r.reopenCount > 0).length;
    const slaBreached = allRows.filter((r) => r.ack.state === 'BREACHED').length;

    return { total, newCount, awaitingAck, inProgress, waitingParentTutor, resolved, reopened, slaBreached };
  }, [data?.rows]);

  const clearFilters = () => {
    setStudentQuery('');
    setCategory('');
    setPriority('');
    setStatus('');
    setSla('');
    setFrom('');
    setTo('');
  };

  const hasFiltersActive = !!(studentQuery || category || priority || status || sla || from || to);

  return (
    <div className="space-y-6" data-testid="complaints-workspace">
      {/* Top action bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void loadComplaints()}
            disabled={loading}
            className="flex items-center gap-1.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          {notice && <span role="status" className="text-xs font-medium text-emerald-700">{notice}</span>}
        </div>
        {canHandle && (
          <Button
            type="button"
            size="sm"
            onClick={() => {
              setActionError(null);
              setCreating(emptyComplaintDraft());
            }}
            className="flex items-center gap-1.5"
          >
            <Plus className="h-4 w-4" />
            Log a Complaint
          </Button>
        )}
      </div>

      {/* Overview Metrics Cards */}
      <section aria-label="Complaints Overview" className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8" data-testid="complaints-metrics">
        <button
          type="button"
          onClick={() => { setStatus(''); setSla(''); }}
          className={`rounded-lg border p-3 text-left transition-all hover:border-brand-500 ${!status && !sla ? 'border-brand-500 bg-brand-50/50' : 'border-slate-200 bg-white'}`}
        >
          <span className="block text-2xl font-bold text-slate-900">{metrics.total}</span>
          <span className="block text-xs font-medium text-slate-600">Total Assigned</span>
        </button>

        <button
          type="button"
          onClick={() => { setStatus('NEW'); setSla(''); }}
          className={`rounded-lg border p-3 text-left transition-all hover:border-brand-500 ${status === 'NEW' ? 'border-brand-500 bg-brand-50/50' : 'border-slate-200 bg-white'}`}
        >
          <span className={`block text-2xl font-bold ${metrics.newCount > 0 ? 'text-amber-700' : 'text-slate-900'}`}>{metrics.newCount}</span>
          <span className="block text-xs font-medium text-slate-600">New</span>
        </button>

        <button
          type="button"
          onClick={() => { setStatus(''); setSla('APPROACHING'); }}
          className={`rounded-lg border p-3 text-left transition-all hover:border-brand-500 ${sla === 'APPROACHING' ? 'border-brand-500 bg-brand-50/50' : 'border-slate-200 bg-white'}`}
        >
          <span className={`block text-2xl font-bold ${metrics.awaitingAck > 0 ? 'text-amber-600' : 'text-slate-900'}`}>{metrics.awaitingAck}</span>
          <span className="block text-xs font-medium text-slate-600">Awaiting Ack</span>
        </button>

        <button
          type="button"
          onClick={() => { setStatus('IN_PROGRESS'); setSla(''); }}
          className={`rounded-lg border p-3 text-left transition-all hover:border-brand-500 ${status === 'IN_PROGRESS' ? 'border-brand-500 bg-brand-50/50' : 'border-slate-200 bg-white'}`}
        >
          <span className="block text-2xl font-bold text-slate-900">{metrics.inProgress}</span>
          <span className="block text-xs font-medium text-slate-600">In Progress</span>
        </button>

        <button
          type="button"
          onClick={() => { setStatus('WAITING_FOR_PARENT'); setSla(''); }}
          className={`rounded-lg border p-3 text-left transition-all hover:border-brand-500 ${status === 'WAITING_FOR_PARENT' ? 'border-brand-500 bg-brand-50/50' : 'border-slate-200 bg-white'}`}
        >
          <span className="block text-2xl font-bold text-slate-900">{metrics.waitingParentTutor}</span>
          <span className="block text-xs font-medium text-slate-600">Waiting Parent/Tutor</span>
        </button>

        <button
          type="button"
          onClick={() => { setStatus('RESOLVED'); setSla(''); }}
          className={`rounded-lg border p-3 text-left transition-all hover:border-brand-500 ${status === 'RESOLVED' ? 'border-brand-500 bg-brand-50/50' : 'border-slate-200 bg-white'}`}
        >
          <span className="block text-2xl font-bold text-emerald-700">{metrics.resolved}</span>
          <span className="block text-xs font-medium text-slate-600">Resolved</span>
        </button>

        <button
          type="button"
          onClick={() => { setStatus('REOPENED'); setSla(''); }}
          className={`rounded-lg border p-3 text-left transition-all hover:border-brand-500 ${status === 'REOPENED' ? 'border-brand-500 bg-brand-50/50' : 'border-slate-200 bg-white'}`}
        >
          <span className={`block text-2xl font-bold ${metrics.reopened > 0 ? 'text-amber-700' : 'text-slate-900'}`}>{metrics.reopened}</span>
          <span className="block text-xs font-medium text-slate-600">Reopened</span>
        </button>

        <button
          type="button"
          onClick={() => { setStatus(''); setSla('BREACHED'); }}
          className={`rounded-lg border p-3 text-left transition-all hover:border-red-500 ${sla === 'BREACHED' ? 'border-red-500 bg-red-50' : 'border-slate-200 bg-white'}`}
        >
          <span className={`block text-2xl font-bold ${metrics.slaBreached > 0 ? 'text-red-700 font-extrabold' : 'text-slate-900'}`}>{metrics.slaBreached}</span>
          <span className="block text-xs font-medium text-slate-600">SLA Breached</span>
        </button>
      </section>

      {/* Filter Bar */}
      <section aria-label="Complaints Filters" className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 shadow-xs" data-testid="complaints-filter-bar">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
          <Filter className="h-3.5 w-3.5" />
          Filter Complaints
        </div>
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Student / Parent / Number</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search..."
                value={studentQuery}
                onChange={(e) => setStudentQuery(e.target.value)}
                className="pl-8 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Category</label>
            <Select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">All Categories</option>
              {CATEGORY_CHOICES.map(([val, lbl]) => (
                <option key={val} value={val}>{lbl}</option>
              ))}
            </Select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Priority</label>
            <Select value={priority} onChange={(e) => setPriority(e.target.value)}>
              <option value="">All Priorities</option>
              {PRIORITY_CHOICES.map(([val, lbl]) => (
                <option key={val} value={val}>{lbl}</option>
              ))}
            </Select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Status</label>
            <Select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All Statuses</option>
              {STATUS_CHOICES.map(([val, lbl]) => (
                <option key={val} value={val}>{lbl}</option>
              ))}
            </Select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">SLA Status</label>
            <Select value={sla} onChange={(e) => setSla(e.target.value)}>
              <option value="">All SLA Statuses</option>
              {SLA_CHOICES.map(([val, lbl]) => (
                <option key={val} value={val}>{lbl}</option>
              ))}
            </Select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Received Date Range</label>
            <div className="grid grid-cols-2 gap-1">
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From date" />
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To date" />
            </div>
          </div>
        </div>

        {hasFiltersActive && (
          <div className="flex items-center justify-between border-t border-slate-100 pt-2">
            <span className="text-xs text-slate-500">Showing {filteredRows.length} matching complaints</span>
            <Button type="button" size="sm" variant="ghost" onClick={clearFilters} className="text-xs">
              Clear All Filters
            </Button>
          </div>
        )}
      </section>

      {/* Error displays */}
      {error && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm font-medium text-red-700">{error}</p>}
      {actionError && !creating && !open && (
        <p role="alert" className="rounded-md bg-red-50 p-3 text-sm font-medium text-red-700">{actionError}</p>
      )}

      {/* Complaints Table */}
      <section aria-label="Complaints Table" className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xs" data-testid="complaints-table-container">
        {loading && !data && (
          <div className="p-8 text-center text-sm text-slate-500">Loading complaints...</div>
        )}

        {!loading && filteredRows.length === 0 && (
          <div className="p-8 text-center text-sm text-slate-500" data-testid="no-complaints-message">
            {hasFiltersActive ? 'No complaints match the selected filters.' : 'No complaints recorded.'}
          </div>
        )}

        {filteredRows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm" data-testid="complaints-table">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                <tr>
                  <th className="px-3 py-2.5">Number</th>
                  <th className="px-3 py-2.5">Title</th>
                  <th className="px-3 py-2.5">Student</th>
                  <th className="px-3 py-2.5">Parent</th>
                  <th className="px-3 py-2.5">Category</th>
                  <th className="px-3 py-2.5">Priority</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5">Received</th>
                  <th className="px-3 py-2.5">Ack SLA</th>
                  <th className="px-3 py-2.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRows.map((c: ComplaintRow) => (
                  <tr key={c.id} className="hover:bg-slate-50/75 transition-colors" data-testid="complaint-row" data-id={c.id}>
                    <td className="px-3 py-2.5 font-mono text-xs font-semibold text-slate-700">{c.number}</td>
                    <td className="px-3 py-2.5 font-medium text-slate-900 max-w-xs truncate" title={c.title}>
                      {c.title}
                    </td>
                    <td className="px-3 py-2.5 text-slate-800">{c.studentName}</td>
                    <td className="px-3 py-2.5 text-slate-600">{c.parentName}</td>
                    <td className="px-3 py-2.5">
                      <Badge variant="default" className="text-xs">{c.categoryLabel}</Badge>
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge variant={PRIORITY_TONE[c.priority] ?? 'default'} className="text-xs">{c.priorityLabel}</Badge>
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge variant={STAGE_TONE[c.stage]} className="text-xs">{c.statusLabel}</Badge>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-slate-600">{when(c.receivedAt)}</td>
                    <td className="px-3 py-2.5">
                      <div className="space-y-0.5">
                        {c.ack.state && (
                          <Badge variant={SLA_TONE[c.ack.state]} className="text-xs">
                            {c.ack.stateLabel}
                          </Badge>
                        )}
                        <p className="text-[11px] text-slate-500 truncate max-w-[180px]" title={ackText(c.ack)}>
                          {ackText(c.ack)}
                        </p>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => void openComplaint(c.id)}
                        data-testid="open-complaint-btn"
                      >
                        Open
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Slide-over Drawer for Complaint Details */}
      {open && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-xs transition-opacity" data-testid="complaint-drawer-backdrop">
          <div className="relative flex h-full w-full max-w-3xl flex-col bg-white shadow-2xl overflow-y-auto p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h2 className="text-lg font-bold text-slate-900">{open.title}</h2>
                <p className="text-xs text-slate-500">Complaint {open.number} • {open.studentName} • Parent: {open.parentName}</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(null)}
                className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100"
                aria-label="Close drawer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <ComplaintDetailView
              key={`${open.id}-${open.entries.length}-${open.status}`}
              c={open}
              handlers={handlers}
              busy={busy !== null}
              error={actionError}
              call={call}
              onClose={() => setOpen(null)}
            />
          </div>
        </div>
      )}

      {/* Modal Dialog for Logging a Complaint */}
      {creating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4" data-testid="log-complaint-modal">
          <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-lg bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <h2 className="text-lg font-bold text-slate-900">Log a Complaint</h2>
              <button
                type="button"
                onClick={() => { setCreating(null); setSelectedActivationId(''); }}
                className="rounded-md p-1 text-slate-500 hover:bg-slate-100"
                aria-label="Close modal"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-1">
              <label className="block text-sm font-medium text-slate-700">
                Student <span className="text-red-600">required</span>
              </label>
              <Select
                value={selectedActivationId}
                onChange={(e) => {
                  setSelectedActivationId(e.target.value);
                  const st = students.find((x) => x.activationId === e.target.value);
                  if (st && creating) {
                    setCreating({ ...creating, parentName: creating.parentName || '' });
                  }
                }}
              >
                <option value="">Choose an assigned student</option>
                {students.map((s) => (
                  <option key={s.activationId} value={s.activationId}>
                    {s.studentName} {s.studentId ? `(${s.studentId})` : ''}
                  </option>
                ))}
              </Select>
            </div>

            <ComplaintForm
              draft={creating}
              busy={busy !== null}
              error={actionError}
              onChange={setCreating}
              onCancel={() => { setCreating(null); setSelectedActivationId(''); }}
              onSubmit={handleCreateSubmit}
            />
          </div>
        </div>
      )}
    </div>
  );
}
