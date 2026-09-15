"use client";

import * as React from 'react';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { reassignLeadAction } from '../../actions';

export function ReassignDialog({ leadId, isOpen, onClose, onSuccess }: { leadId: string, isOpen: boolean, onClose: () => void, onSuccess: () => void }) {
  const [assignedToUserId, setAssignedToUserId] = React.useState('');
  const [reason, setReason] = React.useState('');
  const [loading, setLoading] = React.useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await reassignLeadAction(leadId, assignedToUserId, reason);
      onSuccess();
      onClose();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <h2 className="text-lg font-bold mb-4">Reassign Lead</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="text-sm font-medium">New Owner User ID *</label>
          <Input required value={assignedToUserId} onChange={e => setAssignedToUserId(e.target.value)} placeholder="User UUID..." />
        </div>
        <div>
          <label className="text-sm font-medium">Reason</label>
          <Input value={reason} onChange={e => setReason(e.target.value)} />
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={loading}>Reassign</Button>
        </div>
      </form>
    </Modal>
  );
}
