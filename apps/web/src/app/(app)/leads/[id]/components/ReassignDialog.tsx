"use client";

import * as React from 'react';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { reassignLeadAction, getEmployeesAction } from '../../actions';

export function ReassignDialog({ leadId, isOpen, onClose, onSuccess }: { leadId: string, isOpen: boolean, onClose: () => void, onSuccess: () => void }) {
  const [assignedToUserId, setAssignedToUserId] = React.useState('');
  const [reason, setReason] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [fetchingUsers, setFetchingUsers] = React.useState(true);
  const [users, setUsers] = React.useState<any[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const loadUsers = async () => {
      try {
        const res = await getEmployeesAction();
        const validRoles = ['SALES_HEAD', 'SALES_COUNSELLOR'];
        const validUsers = (res.data || []).filter((u: any) => 
          u.employmentStatus === 'ACTIVE' && 
          u.userId && 
          u.user?.userRoles?.some((ur: any) => validRoles.includes(ur.role?.code))
        );
        setUsers(validUsers);
      } catch (err: any) {
        setError("Failed to load staff.");
      } finally {
        setFetchingUsers(false);
      }
    };

    if (isOpen) {
      setAssignedToUserId('');
      setReason('');
      setError(null);
      loadUsers();
    }
  }, [isOpen]);


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignedToUserId) {
      setError('You must select a new owner.');
      return;
    }
    
    setLoading(true);
    setError(null);
    try {
      await reassignLeadAction(leadId, assignedToUserId, reason);
      onSuccess();
      onClose();
    } catch (e: any) {
      setError(e.message || 'Failed to reassign');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <h2 className="text-lg font-bold mb-4">Reassign Lead</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <div className="p-3 bg-red-50 text-red-600 rounded-md text-sm">{error}</div>}
        
        {fetchingUsers ? (
          <div className="py-4 text-center text-sm text-slate-500">Loading staff directory...</div>
        ) : (
          <>
            <div className="space-y-2">
              <label className="text-sm font-medium">New Owner *</label>
                <Select required value={assignedToUserId} onChange={e => setAssignedToUserId(e.target.value)}>
                  <option value="">-- Select New Owner --</option>
                  {users.map(u => {
                    const title = u.user?.userRoles?.[0]?.role?.name || 'Sales Staff';
                    return (
                      <option key={u.id} value={u.userId}>
                        {u.firstName} {u.lastName} ({title}) {u.employmentStatus === 'ACTIVE' ? '' : '- INACTIVE'}
                      </option>
                    );
                  })}
                </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Reason</label>
              <Input value={reason} onChange={e => setReason(e.target.value)} placeholder="Optional reassignment context..." />
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
              <Button type="submit" disabled={loading || !assignedToUserId}>Reassign Lead</Button>
            </div>
          </>
        )}
      </form>
    </Modal>
  );
}
