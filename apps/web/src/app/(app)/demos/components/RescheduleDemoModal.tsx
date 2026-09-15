'use client';

import * as React from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { rescheduleDemo } from '../actions';

interface RescheduleDemoModalProps {
  isOpen: boolean;
  onClose: () => void;
  demo: any;
  onSuccess: () => void;
}

export function RescheduleDemoModal({ isOpen, onClose, demo, onSuccess }: RescheduleDemoModalProps) {
  const [isLoading, setIsLoading] = React.useState(false);
  const [date, setDate] = React.useState('');
  const [startTime, setStartTime] = React.useState('');
  const [duration, setDuration] = React.useState('');
  const [reason, setReason] = React.useState('');

  React.useEffect(() => {
    if (demo && isOpen) {
      const d = new Date(demo.scheduledAt);
      setDate(d.toISOString().split('T')[0]);
      setStartTime(d.toTimeString().substring(0,5));
      setDuration(demo.durationMinutes?.toString() || '60');
      setReason('');
    }
  }, [demo, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const durNum = parseInt(duration, 10);
    if (durNum < 30 || durNum > 120) {
      alert('Duration must be between 30 and 120 minutes.');
      return;
    }

    setIsLoading(true);
    try {
      const dateObj = new Date(`${date}T${startTime}`);
      await rescheduleDemo(demo.id, {
        scheduledAt: dateObj.toISOString(),
        durationMinutes: durNum,
        reason
      });
      onSuccess();
    } catch (err: any) {
      alert(err.message || 'Failed to reschedule demo');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <h2 className="text-lg font-bold mb-4">Reschedule Demo</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        
        <div className="p-3 bg-slate-50 border border-slate-100 rounded-lg text-sm mb-4">
          <p className="font-medium text-slate-700">
            {demo?.student?.firstName} {demo?.student?.lastName}
          </p>
          <p className="text-slate-500 line-through mt-1">
            Current: {demo?.scheduledAt ? new Intl.DateTimeFormat('en-IN', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(demo.scheduledAt)) : ''}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">New Date</label>
            <Input 
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">New Start Time</label>
            <Input 
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              required
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Duration (minutes)</label>
          <select 
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-shadow"
          >
            <option value="30">30 minutes</option>
            <option value="45">45 minutes</option>
            <option value="60">60 minutes</option>
            <option value="90">90 minutes</option>
            <option value="120">120 minutes</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Reason for rescheduling</label>
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
            Cancel
          </Button>
          <Button type="submit" isLoading={isLoading}>
            Reschedule
          </Button>
        </div>
      </form>
    </Modal>
  );
}
