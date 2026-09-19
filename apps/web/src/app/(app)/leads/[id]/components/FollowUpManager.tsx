"use client";

import * as React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { getFollowUpsAction, createFollowUpAction, completeFollowUpAction, rescheduleFollowUpAction } from '../../actions';
import { Calendar, AlertCircle } from 'lucide-react';
import { usePermissions } from '@/components/providers/AuthProvider';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Alert } from '@/components/ui/Alert';

export function FollowUpManager({ lead, onUpdate }: { lead: any, onUpdate?: () => void }) {
  const [followUps, setFollowUps] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const { hasPermission } = usePermissions();

  const [isCreateOpen, setIsCreateOpen] = React.useState(false);
  const [isCompleteOpen, setIsCompleteOpen] = React.useState(false);
  const [isRescheduleOpen, setIsRescheduleOpen] = React.useState(false);
  const [actionLoading, setActionLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Form states
  const [scheduledAt, setScheduledAt] = React.useState('');
  const [remarks, setRemarks] = React.useState('');
  const [classification, setClassification] = React.useState('QUALIFIED');

  // Next follow up states
  const [scheduleNext, setScheduleNext] = React.useState(false);
  const [nextScheduledAt, setNextScheduledAt] = React.useState('');
  const [nextRemarks, setNextRemarks] = React.useState('');

  const leadId = lead?.id;

  const loadFollowUps = React.useCallback(async () => {
    if (!leadId) return;
    setLoading(true);
    try {
      const res = await getFollowUpsAction(leadId);
      setFollowUps(Array.isArray(res) ? res : (res.data || []));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  React.useEffect(() => {
    loadFollowUps();
  }, [loadFollowUps]);

  const activeFup = followUps.length > 0 ? followUps[0] : null;
  const isOverdue = activeFup?.status === 'OVERDUE' || (activeFup && new Date(activeFup.scheduledAt) < new Date());

  const isFollowUpRequired = () => {
    if (classification === 'JUNK') return false;
    if (lead.status === 'LOST') return false;
    if (lead.status === 'NOT_INTERESTED') return false;
    // Check if Paid/Enrolled
    if (lead.status === 'PAID') return false;
    // If not closed, not lost, not junk, not not_interested -> active process -> required.
    return true;
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    setError(null);
    try {
      await createFollowUpAction(leadId, new Date(scheduledAt).toISOString(), remarks);
      setIsCreateOpen(false);
      loadFollowUps();
      if (onUpdate) onUpdate();
    } catch (e: any) { setError(e.message); }
    finally { setActionLoading(false); }
  };

  const handleComplete = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (isFollowUpRequired() && !scheduleNext) {
      setError("An active sales process requires a next follow-up. Please schedule the next one or change the classification/status.");
      return;
    }

    if (scheduleNext && !nextScheduledAt) {
      setError("Next scheduled date & time is required.");
      return;
    }

    setActionLoading(true);
    try {
      await completeFollowUpAction(leadId, activeFup.id, classification, remarks);
      if (scheduleNext && nextScheduledAt) {
        await createFollowUpAction(leadId, new Date(nextScheduledAt).toISOString(), nextRemarks);
      }
      setIsCompleteOpen(false);
      
      // Reset forms
      setScheduleNext(false);
      setNextScheduledAt('');
      setNextRemarks('');
      setRemarks('');
      setClassification('QUALIFIED');

      loadFollowUps();
      if (onUpdate) onUpdate();
    } catch (e: any) { setError(e.message); }
    finally { setActionLoading(false); }
  };

  const handleReschedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!remarks.trim()) {
      setError("Reschedule reason is REQUIRED.");
      return;
    }

    setActionLoading(true);
    setError(null);
    try {
      await rescheduleFollowUpAction(leadId, activeFup.id, new Date(scheduledAt).toISOString(), remarks);
      setIsRescheduleOpen(false);
      loadFollowUps();
      if (onUpdate) onUpdate();
    } catch (e: any) { setError(e.message); }
    finally { setActionLoading(false); }
  };

  return (
    <div className="space-y-6">
      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between py-4 bg-slate-50/50 border-b border-slate-100">
          <CardTitle>Current Follow-up</CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          {loading ? (
            <p className="text-sm text-slate-500 text-center py-4">Loading follow-ups...</p>
          ) : activeFup ? (
            <div className={`p-4 rounded-md border ${isOverdue ? 'bg-rose-50 border-rose-200' : 'bg-amber-50 border-amber-200'} flex items-start gap-4`}>
              <div className="mt-1 shrink-0">
                {isOverdue ? <AlertCircle className="w-6 h-6 text-rose-500" /> : <Calendar className="w-6 h-6 text-amber-500" />}
              </div>
              <div className="flex-1">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className={`text-lg font-bold ${isOverdue ? 'text-rose-900' : 'text-amber-900'}`}>
                      {isOverdue ? 'Overdue Follow-up' : 'Scheduled Follow-up'}
                    </h3>
                    <p className={`text-sm font-medium ${isOverdue ? 'text-rose-700' : 'text-amber-700'} mt-1`}>
                      Due: {new Date(activeFup.scheduledAt).toLocaleString()}
                    </p>
                  </div>
                </div>
                {activeFup.remarks && (
                  <p className={`text-sm mt-3 p-3 rounded bg-white/50 border ${isOverdue ? 'border-rose-100 text-rose-800' : 'border-amber-100 text-amber-800'}`}>
                    &quot;{activeFup.remarks}&quot;
                  </p>
                )}
                <div className="mt-4 flex gap-3">
                  {hasPermission('followup.complete') && (
                    <Button onClick={() => setIsCompleteOpen(true)} className={isOverdue ? 'bg-rose-600 hover:bg-rose-700' : ''}>
                      Complete Action
                    </Button>
                  )}
                  {hasPermission('followup.reschedule') && (
                    <Button variant="outline" onClick={() => setIsRescheduleOpen(true)} className={isOverdue ? 'border-rose-300 text-rose-700 hover:bg-rose-100' : 'border-amber-300 text-amber-700 hover:bg-amber-100'}>
                      Reschedule
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-10">
              <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Calendar className="w-6 h-6 text-slate-400" />
              </div>
              <p className="text-base font-medium text-slate-900 mb-2">No active follow-ups</p>
              
              {lead.requiresFollowUp && lead.status !== 'LOST' && lead.status !== 'PAID' ? (
                <div className="mb-4">
                  <p className="text-sm text-rose-600 font-medium bg-rose-50 px-3 py-1.5 rounded-full inline-block">
                    Action Required: Lead is active but has no scheduled follow-up
                  </p>
                </div>
              ) : (
                <p className="text-sm text-slate-500 mb-4">Lead is either closed, lost, or currently does not require contact.</p>
              )}
              
              {hasPermission('followup.create') && (
                <Button onClick={() => setIsCreateOpen(true)}>Create New Follow-up</Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Modal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)}>
        <h2 className="text-lg font-bold mb-4">Create Follow-up</h2>
        <form onSubmit={handleCreate} className="space-y-4">
          {error && <div className="p-3 bg-red-50 text-red-600 rounded-md text-sm">{error}</div>}
          <div className="space-y-2">
            <label className="text-sm font-medium">Date & Time *</label>
            <Input type="datetime-local" required value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Remarks</label>
            <textarea className="w-full min-h-[80px] p-2 border border-slate-200 rounded-md text-sm" value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="Optional context..." />
          </div>
          <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
            <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)} disabled={actionLoading}>Cancel</Button>
            <Button type="submit" disabled={actionLoading || !scheduledAt}>Save</Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={isCompleteOpen} onClose={() => setIsCompleteOpen(false)}>
        <h2 className="text-lg font-bold mb-4">Complete Follow-up</h2>
        <form onSubmit={handleComplete} className="space-y-4">
          {error && <div className="p-3 bg-red-50 text-red-600 rounded-md text-sm">{error}</div>}
          
          <div className="space-y-2">
            <label className="text-sm font-medium">Outcome Classification</label>
            <Select value={classification} onChange={e => {
              setClassification(e.target.value);
              // Auto-uncheck schedule next if JUNK
              if (e.target.value === 'JUNK') setScheduleNext(false);
            }}>
              <option value="QUALIFIED">Qualified</option>
              <option value="NON_QUALIFIED">Non-Qualified</option>
              <option value="NO_RESPONSE">No Response</option>
              <option value="JUNK">Junk</option>
            </Select>
          </div>
          
          <div className="space-y-2">
            <label className="text-sm font-medium">Completion Remarks</label>
            <textarea className="w-full min-h-[80px] p-2 border border-slate-200 rounded-md text-sm" value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="What happened during this contact?" />
          </div>
          
          <div className="pt-4 border-t border-slate-100">
            <label className="flex items-start gap-3 cursor-pointer p-3 bg-slate-50 border border-slate-200 rounded-md">
              <input 
                type="checkbox" 
                checked={scheduleNext} 
                onChange={(e) => setScheduleNext(e.target.checked)} 
                disabled={classification === 'JUNK' || lead.status === 'LOST' || lead.status === 'PAID'}
                className="mt-1 w-4 h-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
              />
              <div>
                <span className="text-sm font-medium text-slate-900 block">Schedule Next Follow-up</span>
                <span className="text-xs text-slate-500">
                  {classification === 'JUNK' ? 'Not required for Junk classification' : isFollowUpRequired() ? 'Required for active sales process' : 'Optional'}
                </span>
              </div>
            </label>
          </div>

          {scheduleNext && (
            <div className="space-y-4 bg-brand-50/50 p-4 rounded-md border border-brand-100 ml-7">
              <div className="space-y-2">
                <label className="text-sm font-medium">Next Date & Time *</label>
                <Input type="datetime-local" required={scheduleNext} value={nextScheduledAt} onChange={e => setNextScheduledAt(e.target.value)} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Next Remarks</label>
                <Input value={nextRemarks} onChange={e => setNextRemarks(e.target.value)} placeholder="What's the plan for next time?" />
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setIsCompleteOpen(false)} disabled={actionLoading}>Cancel</Button>
            <Button type="submit" disabled={actionLoading}>Complete Action</Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={isRescheduleOpen} onClose={() => setIsRescheduleOpen(false)}>
        <h2 className="text-lg font-bold mb-4">Reschedule Follow-up</h2>
        <form onSubmit={handleReschedule} className="space-y-4">
          {error && <div className="p-3 bg-red-50 text-red-600 rounded-md text-sm">{error}</div>}
          <div className="space-y-2">
            <label className="text-sm font-medium">New Date & Time *</label>
            <Input type="datetime-local" required value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Reschedule Reason *</label>
            <textarea 
              className="w-full min-h-[80px] p-2 border border-slate-200 rounded-md text-sm focus:border-rose-300 focus:ring-rose-200" 
              required 
              value={remarks} 
              onChange={e => setRemarks(e.target.value)} 
              placeholder="Mandatory: Why is this being rescheduled?" 
            />
            <p className="text-xs text-slate-500">A reason is required to maintain accurate audit history.</p>
          </div>
          <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
            <Button type="button" variant="outline" onClick={() => setIsRescheduleOpen(false)} disabled={actionLoading}>Cancel</Button>
            <Button type="submit" disabled={actionLoading || !scheduledAt || !remarks.trim()}>Reschedule</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
