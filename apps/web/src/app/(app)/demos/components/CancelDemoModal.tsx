'use client';

import * as React from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { cancelDemo } from '../actions';

interface CancelDemoModalProps {
  isOpen: boolean;
  onClose: () => void;
  demo: any;
  onSuccess: () => void;
}

export function CancelDemoModal({ isOpen, onClose, demo, onSuccess }: CancelDemoModalProps) {
  const [isLoading, setIsLoading] = React.useState(false);
  const [reason, setReason] = React.useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await cancelDemo(demo.id, { reason });
      onSuccess();
    } catch (err: any) {
      alert(err.message || 'Failed to cancel demo');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <h2 className="text-lg font-bold mb-4">Cancel Demo</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        
        <div className="p-3 bg-red-50 text-red-800 border border-red-100 rounded-lg text-sm mb-4">
          <p className="font-medium">
            Are you sure you want to cancel the demo for {demo?.student?.firstName}?
          </p>
          <p className="mt-1 opacity-90">This action cannot be undone, but the history will be preserved.</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Reason for cancellation</label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-shadow"
            rows={3}
            required
            placeholder="Please provide a reason..."
          />
        </div>

        <div className="pt-4 flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button type="submit" isLoading={isLoading} className="bg-red-600 hover:bg-red-700">
            Confirm Cancellation
          </Button>
        </div>
      </form>
    </Modal>
  );
}
