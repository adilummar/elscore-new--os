'use client';

import * as React from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { markNoShowDemo } from '../actions';

interface NoShowDemoModalProps {
  isOpen: boolean;
  onClose: () => void;
  demo: any;
  onSuccess: () => void;
}

export function NoShowDemoModal({ isOpen, onClose, demo, onSuccess }: NoShowDemoModalProps) {
  const [isLoading, setIsLoading] = React.useState(false);
  const [reason, setReason] = React.useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await markNoShowDemo(demo.id, { reason });
      onSuccess();
    } catch (err: any) {
      alert(err.message || 'Failed to mark as no-show');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <h2 className="text-lg font-bold mb-4">Mark as No-Show</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        
        <div className="p-3 bg-amber-50 text-amber-800 border border-amber-100 rounded-lg text-sm mb-4">
          <p className="font-medium">
            Mark {demo?.student?.firstName}&apos;s demo as No-Show?
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Additional details (Optional)</label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-shadow"
            rows={3}
            required
            placeholder="E.g., Student didn't join after 15 mins..."
          />
        </div>

        <div className="pt-4 flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isLoading} className="bg-amber-600 hover:bg-amber-700">
            Confirm No-Show
          </Button>
        </div>
      </form>
    </Modal>
  );
}
