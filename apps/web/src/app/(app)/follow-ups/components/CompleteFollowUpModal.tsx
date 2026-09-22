'use client';

import * as React from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { completeFollowUp } from '../actions';

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(d);
}

interface CompleteFollowUpModalProps {
  isOpen: boolean;
  onClose: () => void;
  followUp: any;
  onSuccess: () => void;
}

export function CompleteFollowUpModal({ isOpen, onClose, followUp, onSuccess }: CompleteFollowUpModalProps) {
  const [isLoading, setIsLoading] = React.useState(false);
  const [classification, setClassification] = React.useState('QUALIFIED');
  const [remarks, setRemarks] = React.useState('');
  
  const [scheduleNext, setScheduleNext] = React.useState(true);
  const [nextDate, setNextDate] = React.useState('');
  const [nextTime, setNextTime] = React.useState('');
  const [nextRemarks, setNextRemarks] = React.useState('');

  React.useEffect(() => {
    if (classification === 'JUNK') {
      setScheduleNext(false);
    } else {
      setScheduleNext(true);
    }
  }, [classification]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const data: any = {
        classification,
        remarks: remarks || undefined,
      };

      if (scheduleNext && nextDate && nextTime) {
        // Construct ISO string
        const dateObj = new Date(`${nextDate}T${nextTime}`);
        data.nextFollowUpAt = dateObj.toISOString();
        data.nextFollowUpRemarks = nextRemarks || undefined;
      }

      await completeFollowUp(followUp.leadId, followUp.id, data);
      
      onSuccess();
    } catch (err: any) {
      alert(err.message || 'Failed to complete follow-up');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="p-1">
        <h2 className="text-xl font-bold text-slate-900 mb-4">Complete Follow-up</h2>
        
        <div className="mb-6 p-3 bg-slate-50 rounded-lg text-sm border border-slate-100">
          <p className="font-medium text-slate-700">
            {followUp.lead?.firstName} {followUp.lead?.lastName}
          </p>
          <p className="text-slate-500 mt-1">
            Scheduled: {formatDate(followUp.scheduledAt)}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Result Classification</label>
            <Select 
              value={classification} 
              onChange={(e) => setClassification(e.target.value)}
              required
            >
              <option value="QUALIFIED">Qualified</option>
              <option value="NON_QUALIFIED">Non-Qualified</option>
              <option value="NO_RESPONSE">No Response</option>
              <option value="JUNK">Junk</option>
            </Select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Completion Notes</label>
            <textarea
              className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm"
              rows={3}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="What happened during this interaction?"
              required
            />
          </div>

          {classification !== 'JUNK' && (
            <div className="pt-4 border-t border-slate-100 mt-4 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900">Schedule Next Follow-up</h3>
                <input 
                  type="checkbox" 
                  checked={scheduleNext} 
                  onChange={(e) => setScheduleNext(e.target.checked)}
                  className="rounded text-brand-600 focus:ring-brand-500"
                />
              </div>
              
              {scheduleNext && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Date</label>
                      <Input 
                        type="date" 
                        required 
                        value={nextDate} 
                        onChange={(e) => setNextDate(e.target.value)} 
                        min={new Date().toISOString().split('T')[0]}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Time</label>
                      <Input 
                        type="time" 
                        required 
                        value={nextTime} 
                        onChange={(e) => setNextTime(e.target.value)} 
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Next Action Notes</label>
                    <textarea
                      className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm"
                      rows={2}
                      value={nextRemarks}
                      onChange={(e) => setNextRemarks(e.target.value)}
                      required
                    />
                  </div>
                </>
              )}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-6">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" isLoading={isLoading}>Complete</Button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
