'use client';

import * as React from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { rescheduleDemo } from '../actions';
import { Calendar, Clock, ArrowRight, Video } from 'lucide-react';

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
  const [endTime, setEndTime] = React.useState('');
  const [reason, setReason] = React.useState('');

  React.useEffect(() => {
    if (demo && isOpen) {
      const d = new Date(demo.scheduledAt);
      setDate(d.toISOString().split('T')[0]);
      
      const st = d.toTimeString().substring(0,5);
      setStartTime(st);
      
      const durationMin = demo.durationMinutes || 60;
      const endD = new Date(d.getTime() + durationMin * 60000);
      setEndTime(endD.toTimeString().substring(0,5));
      
      setReason('');
    }
  }, [demo, isOpen]);

  let duration = 0;
  if (date && startTime && endTime) {
    const start = new Date(`${date}T${startTime}`);
    const end = new Date(`${date}T${endTime}`);
    duration = (end.getTime() - start.getTime()) / 60000;
  }

  const handleStartTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newStart = e.target.value;
    setStartTime(newStart);
    if (newStart && !endTime) {
      const [hours, minutes] = newStart.split(':').map(Number);
      let endHours = hours + 1;
      if (endHours >= 24) endHours = 23;
      setEndTime(`${endHours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (duration < 15) {
      alert('Duration must be at least 15 minutes.');
      return;
    }

    setIsLoading(true);
    try {
      const dateObj = new Date(`${date}T${startTime}`);
      await rescheduleDemo(demo.id, {
        scheduledAt: dateObj.toISOString(),
        durationMinutes: duration,
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
      <div className="flex items-center gap-3 mb-6 pb-4 border-b border-slate-100 mt-2">
        <div className="h-10 w-10 bg-brand-50 text-brand-600 rounded-xl flex items-center justify-center">
          <Calendar className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-800">Reschedule Demo</h2>
          <p className="text-sm text-slate-500">Update demo timing for the student</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl text-sm">
          <p className="font-medium text-slate-700 flex items-center gap-2">
             <Video className="w-4 h-4 text-slate-400" />
            {demo?.student?.firstName} {demo?.student?.lastName}
          </p>
          <p className="text-slate-500 line-through mt-2 pl-6">
            Current: {demo?.scheduledAt ? new Intl.DateTimeFormat('en-IN', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(demo.scheduledAt)) : ''}
          </p>
        </div>

        <div className="space-y-4 bg-slate-50/50 p-4 rounded-xl border border-slate-100">
          <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2 mb-2">
            <Clock className="w-4 h-4 text-slate-400" />
            New Schedule Time
          </h3>
          
          <div>
            <label className="text-sm font-medium text-slate-700 mb-1.5 block">New Date *</label>
            <Input 
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
              className="w-full"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1.5 block">From *</label>
              <div className="relative">
                <Input 
                  type="time"
                  value={startTime}
                  onChange={handleStartTimeChange}
                  required
                  className="w-full pl-9"
                />
                <Clock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1.5 block">To *</label>
              <div className="relative">
                <Input 
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  required
                  className="w-full pl-9"
                />
                <Clock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>
          </div>
          
          {duration > 0 && (
            <div className={`text-sm mt-2 flex items-center gap-2 ${duration < 15 ? 'text-red-500' : 'text-slate-500'}`}>
              <ArrowRight className="w-4 h-4" />
              Duration: <span className="font-semibold">{duration} minutes</span>
            </div>
          )}
          {duration < 0 && (
            <div className="text-sm mt-2 text-red-500 flex items-center gap-2">
              <ArrowRight className="w-4 h-4" />
              End time must be after start time
            </div>
          )}
        </div>

        <div className="space-y-4">
          <label className="text-sm font-medium text-slate-700 block">Reason for updating *</label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full px-3 py-2 bg-surface border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-colors"
            rows={3}
            required
            placeholder="Please provide a reason..."
          />
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
          <Button type="button" variant="outline" onClick={onClose} className="w-24">
            Cancel
          </Button>
          <Button 
            type="submit" 
            isLoading={isLoading}
            disabled={!date || !startTime || !endTime || duration <= 0 || !reason}
            className="w-32"
          >
            {isLoading ? 'Updating...' : 'Reschedule'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
