'use client';

import * as React from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { createFollowUp, searchLeads } from '../actions';

interface CreateFollowUpModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function CreateFollowUpModal({ isOpen, onClose, onSuccess }: CreateFollowUpModalProps) {
  const [isLoading, setIsLoading] = React.useState(false);
  const [leadSearch, setLeadSearch] = React.useState('');
  const [leadResults, setLeadResults] = React.useState<any[]>([]);
  const [selectedLead, setSelectedLead] = React.useState<any | null>(null);
  
  const [date, setDate] = React.useState('');
  const [time, setTime] = React.useState('');
  const [remarks, setRemarks] = React.useState('');

  React.useEffect(() => {
    const timer = setTimeout(async () => {
      if (leadSearch.length > 2 && !selectedLead) {
        try {
          const res = await searchLeads(leadSearch);
          setLeadResults(res.data || []);
        } catch (e) {
          console.error(e);
        }
      } else {
        setLeadResults([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [leadSearch, selectedLead]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLead) {
      alert('Please select a lead first');
      return;
    }
    setIsLoading(true);

    try {
      const dateObj = new Date(`${date}T${time}`);
      await createFollowUp(selectedLead.id, {
        scheduledAt: dateObj.toISOString(),
        remarks: remarks || undefined,
      });
      
      onSuccess();
    } catch (err: any) {
      alert(err.message || 'Failed to create follow-up');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="p-1">
        <h2 className="text-xl font-bold text-slate-900 mb-4">New Follow-up</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          
          <div className="relative">
            <label className="block text-sm font-medium text-slate-700 mb-1">Select Lead</label>
            {selectedLead ? (
              <div className="flex items-center justify-between p-3 border border-brand-200 bg-brand-50 rounded-md">
                <span className="font-medium text-brand-900">
                  {selectedLead.firstName} {selectedLead.lastName} ({selectedLead.primaryPhone})
                </span>
                <button type="button" onClick={() => { setSelectedLead(null); setLeadSearch(''); }} className="text-slate-400 hover:text-slate-600">
                  ✕
                </button>
              </div>
            ) : (
              <div>
                <Input 
                  type="text" 
                  placeholder="Search lead by name or phone..." 
                  value={leadSearch}
                  onChange={(e) => setLeadSearch(e.target.value)}
                />
                {leadResults.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-md shadow-lg max-h-48 overflow-y-auto">
                    {leadResults.map(lead => (
                      <button
                        key={lead.id}
                        type="button"
                        onClick={() => {
                          setSelectedLead(lead);
                          setLeadSearch('');
                          setLeadResults([]);
                        }}
                        className="w-full text-left px-4 py-2 text-sm hover:bg-slate-50 focus:bg-slate-50 border-b border-slate-100 last:border-0"
                      >
                        <span className="font-medium">{lead.firstName} {lead.lastName}</span>
                        <span className="text-slate-500 ml-2">{lead.primaryPhone}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Date</label>
              <Input 
                type="date" 
                required 
                value={date} 
                onChange={(e) => setDate(e.target.value)} 
                min={new Date().toISOString().split('T')[0]}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Time</label>
              <Input 
                type="time" 
                required 
                value={time} 
                onChange={(e) => setTime(e.target.value)} 
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Remarks (Optional)</label>
            <textarea
              className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm"
              rows={3}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Context or action items..."
            />
          </div>

          <div className="flex justify-end gap-3 pt-6">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" isLoading={isLoading} disabled={!selectedLead}>Create</Button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
