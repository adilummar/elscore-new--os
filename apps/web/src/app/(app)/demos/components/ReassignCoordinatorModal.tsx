'use client';

import * as React from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { getCoordinators, reassignCoordinator } from '../actions';
import { UserCheck, AlertCircle, Users } from 'lucide-react';

interface ReassignCoordinatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  demo: any;
  onSuccess: () => void;
}

export function ReassignCoordinatorModal({ isOpen, onClose, demo, onSuccess }: ReassignCoordinatorModalProps) {
  const [isLoading, setIsLoading] = React.useState(false);
  const [coordinators, setCoordinators] = React.useState<any[]>([]);
  const [selectedCoordId, setSelectedCoordId] = React.useState('');
  const [reason, setReason] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (isOpen) {
      setError(null);
      setReason('');
      async function loadCoordinators() {
        try {
          const res = await getCoordinators();
          const list = Array.isArray(res) ? res : (res.data || []);
          setCoordinators(list);
          const currentId = demo?.coordinator?.id || demo?.booking?.coordinatorId || '';
          const candidate = list.find((c: any) => c.id !== currentId) || list[0];
          if (candidate) {
            setSelectedCoordId(candidate.id);
          }
        } catch (e: any) {
          setError('Failed to load coordinators list');
        }
      }
      loadCoordinators();
    }
  }, [isOpen, demo]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCoordId) {
      setError('Please select a coordinator');
      return;
    }
    if (!reason.trim()) {
      setError('Please provide a reason for reassignment');
      return;
    }

    setIsLoading(true);
    setError(null);

    const demoId = demo.booking?.id || demo.id;
    const res = await reassignCoordinator(demoId, {
      coordinatorId: selectedCoordId,
      reason: reason.trim(),
    });
    setIsLoading(false);

    if (!res.success) {
      setError(res.error || 'Failed to reassign coordinator');
    } else {
      onSuccess();
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="md">
      <div className="space-y-5">
        <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
          <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
            <UserCheck className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-slate-900">
              Reassign Demo Coordinator
            </h3>
            <p className="text-xs text-slate-500">
              Select an active coordinator to rebalance workload or cover leave
            </p>
          </div>
        </div>

        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-start gap-2 text-rose-700 text-sm">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider block mb-1.5">
              Select Coordinator
            </label>
            <select
              value={selectedCoordId}
              onChange={(e) => setSelectedCoordId(e.target.value)}
              className="w-full text-sm rounded-lg border border-slate-200 p-2.5 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              {coordinators.map((c) => {
                const name = c.employee ? `${c.employee.firstName} ${c.employee.lastName}` : c.email;
                return (
                  <option key={c.id} value={c.id}>
                    {name} ({c.email})
                  </option>
                );
              })}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider block mb-1.5">
              Reason for Reassignment (Mandatory)
            </label>
            <Input
              type="text"
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Primary coordinator on leave / urgent schedule coverage"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
            <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading} className="bg-purple-600 hover:bg-purple-700 text-white">
              {isLoading ? 'Reassigning...' : 'Confirm Reassignment'}
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
