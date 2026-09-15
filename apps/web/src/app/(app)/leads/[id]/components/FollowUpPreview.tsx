"use client";

import * as React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { getFollowUpsAction, createFollowUpAction, completeFollowUpAction, rescheduleFollowUpAction } from '../../actions';
import { Calendar } from 'lucide-react';
import { usePermissions } from '@/components/providers/AuthProvider';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';

export function FollowUpPreview({ leadId }: { leadId: string }) {
  const [followUps, setFollowUps] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const { hasPermission } = usePermissions();

  const [isCreateOpen, setIsCreateOpen] = React.useState(false);
  const [isCompleteOpen, setIsCompleteOpen] = React.useState(false);
  const [isRescheduleOpen, setIsRescheduleOpen] = React.useState(false);
  const [actionLoading, setActionLoading] = React.useState(false);

  // Form states
  const [scheduledAt, setScheduledAt] = React.useState('');
  const [remarks, setRemarks] = React.useState('');
  const [classification, setClassification] = React.useState('QUALIFIED');

  const loadFollowUps = React.useCallback(async () => {
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

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    try {
      await createFollowUpAction(leadId, new Date(scheduledAt).toISOString(), remarks);
      setIsCreateOpen(false);
      loadFollowUps();
    } catch (e: any) { alert(e.message); }
    finally { setActionLoading(false); }
  };

  const handleComplete = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    try {
      await completeFollowUpAction(leadId, activeFup.id, classification, remarks);
      setIsCompleteOpen(false);
      loadFollowUps();
    } catch (e: any) { alert(e.message); }
    finally { setActionLoading(false); }
  };

  const handleReschedule = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    try {
      await rescheduleFollowUpAction(leadId, activeFup.id, new Date(scheduledAt).toISOString(), remarks);
      setIsRescheduleOpen(false);
      loadFollowUps();
    } catch (e: any) { alert(e.message); }
    finally { setActionLoading(false); }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between py-4">
        <CardTitle>Next Follow-up</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-slate-500">Loading...</p>
        ) : activeFup ? (
          <div className="p-4 bg-amber-50 rounded-md border border-amber-100 flex items-start gap-3">
            <Calendar className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-amber-900">Scheduled for {new Date(activeFup.scheduledAt).toLocaleString()}</p>
              <p className="text-xs text-amber-700 mt-1">{activeFup.remarks || 'No remarks provided.'}</p>
              <div className="mt-3 flex gap-2">
                {hasPermission('followup.complete') && <Button size="sm" onClick={() => setIsCompleteOpen(true)}>Complete</Button>}
                {hasPermission('followup.reschedule') && <Button size="sm" variant="outline" onClick={() => setIsRescheduleOpen(true)}>Reschedule</Button>}
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-6 text-slate-500">
            <p className="text-sm mb-3">No active follow-ups scheduled.</p>
            {hasPermission('followup.create') && <Button size="sm" onClick={() => setIsCreateOpen(true)}>Create Follow-up</Button>}
          </div>
        )}
      </CardContent>

      <Modal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)}>
        <h2 className="text-lg font-bold mb-4">Create Follow-up</h2>
        <form onSubmit={handleCreate} className="space-y-4">
          <div><label className="text-sm">Date & Time *</label><Input type="datetime-local" required value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} /></div>
          <div><label className="text-sm">Remarks</label><Input value={remarks} onChange={e => setRemarks(e.target.value)} /></div>
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button><Button type="submit" disabled={actionLoading}>Save</Button></div>
        </form>
      </Modal>

      <Modal isOpen={isCompleteOpen} onClose={() => setIsCompleteOpen(false)}>
        <h2 className="text-lg font-bold mb-4">Complete Follow-up</h2>
        <form onSubmit={handleComplete} className="space-y-4">
          <div>
            <label className="text-sm">Classification</label>
            <Select value={classification} onChange={e => setClassification(e.target.value)}>
              <option value="QUALIFIED">Qualified</option>
              <option value="NON_QUALIFIED">Non-Qualified</option>
              <option value="NO_RESPONSE">No Response</option>
              <option value="JUNK">Junk</option>
            </Select>
          </div>
          <div><label className="text-sm">Remarks</label><Input value={remarks} onChange={e => setRemarks(e.target.value)} /></div>
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setIsCompleteOpen(false)}>Cancel</Button><Button type="submit" disabled={actionLoading}>Complete</Button></div>
        </form>
      </Modal>

      <Modal isOpen={isRescheduleOpen} onClose={() => setIsRescheduleOpen(false)}>
        <h2 className="text-lg font-bold mb-4">Reschedule Follow-up</h2>
        <form onSubmit={handleReschedule} className="space-y-4">
          <div><label className="text-sm">New Date & Time *</label><Input type="datetime-local" required value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} /></div>
          <div><label className="text-sm">Reason *</label><Input required value={remarks} onChange={e => setRemarks(e.target.value)} /></div>
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setIsRescheduleOpen(false)}>Cancel</Button><Button type="submit" disabled={actionLoading}>Reschedule</Button></div>
        </form>
      </Modal>
    </Card>
  );
}
