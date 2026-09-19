"use client";

import * as React from 'react';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { updateLeadStatusAction } from '../../actions';

export function LeadStatusChangeDialog({ leadId, currentStatus, isOpen, onClose, onSuccess }: { leadId: string, currentStatus: string, isOpen: boolean, onClose: () => void, onSuccess: () => void }) {
  const [status, setStatus] = React.useState(currentStatus);
  const [reason, setReason] = React.useState('');
  const [loading, setLoading] = React.useState(false);

  const [error, setError] = React.useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      setError('A reason is required for status changes.');
      return;
    }
    
    setLoading(true);
    setError(null);
    try {
      await updateLeadStatusAction(leadId, status, reason);
      onSuccess();
      onClose();
    } catch (e: any) {
      setError(e.message || 'Failed to update status');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <h2 className="text-lg font-bold mb-4">Change Status</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <div className="p-3 bg-red-50 text-red-600 rounded-md text-sm">{error}</div>}
        <div>
          <label className="text-sm font-medium">New Status</label>
          <Select value={status} onChange={e => setStatus(e.target.value)}>
            <option value="NEW">NEW</option>
            <option value="CONTACTED">CONTACTED</option>
            <option value="INTERESTED">INTERESTED</option>
            <option value="DEMO_BOOKED">DEMO_BOOKED</option>
            <option value="DEMO_COMPLETED">DEMO_COMPLETED</option>
            <option value="NEGOTIATION">NEGOTIATION</option>
            <option value="NURTURE">NURTURE</option>
            <option value="ENROLLED">ENROLLED</option>
            <option value="NOT_INTERESTED">NOT_INTERESTED</option>
            <option value="NO_RESPONSE">NO_RESPONSE</option>
            <option value="LOST">LOST</option>
            <option value="JUNK">JUNK</option>
          </Select>
        </div>
        <div>
          <label className="text-sm font-medium">Reason *</label>
          <Input required value={reason} onChange={e => setReason(e.target.value)} placeholder="Required reason for change..." />
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={loading}>Save</Button>
        </div>
      </form>
    </Modal>
  );
}
