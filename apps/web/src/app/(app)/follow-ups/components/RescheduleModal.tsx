'use client';

import * as React from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { rescheduleFollowUp } from '../actions';

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(d);
}

interface RescheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  followUp: any;
  onSuccess: () => void;
}

export function RescheduleModal({ isOpen, onClose, followUp, onSuccess }: RescheduleModalProps) {
  const [isLoading, setIsLoading] = React.useState(false);
  
  const [date, setDate] = React.useState('');
  const [time, setTime] = React.useState('');
  const [reason, setReason] = React.useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const dateObj = new Date(`${date}T${time}`);
      await rescheduleFollowUp(followUp.leadId, followUp.id, {
        newScheduledAt: dateObj.toISOString(),
        reason: reason || undefined,
      });
      
      onSuccess();
    } catch (err: any) {
      alert(err.message || 'Failed to reschedule follow-up');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="p-1">
        <h2 className="text-xl font-bold text-slate-900 mb-4">Reschedule Follow-up</h2>
        
        <div className="mb-6 p-3 bg-slate-50 rounded-lg text-sm border border-slate-100">
          <p className="font-medium text-slate-700">
            {followUp.lead?.firstName} {followUp.lead?.lastName}
          </p>
          <p className="text-slate-500 mt-1 line-through opacity-70">
            Current: {formatDate(followUp.scheduledAt)}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">New Date</label>
              <Input 
                type="date" 
                required 
                value={date} 
                onChange={(e) => setDate(e.target.value)} 
                min={new Date().toISOString().split('T')[0]}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">New Time</label>
              <Input 
                type="time" 
                required 
                value={time} 
                onChange={(e) => setTime(e.target.value)} 
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Reason for rescheduling (Optional)</label>
            <Input 
              type="text" 
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Client requested a different time"
            />
          </div>

          <div className="flex justify-end gap-3 pt-6">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" isLoading={isLoading}>Reschedule</Button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
