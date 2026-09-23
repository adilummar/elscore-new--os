"use client";

import * as React from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { bookDemo, searchLeads } from '../actions';
import { Calendar, Clock, User, ArrowRight, Video, Search } from 'lucide-react';

interface BookDemoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialLead?: any;
}

export function BookDemoModal({ isOpen, onClose, onSuccess, initialLead }: BookDemoModalProps) {
  const [isLoading, setIsLoading] = React.useState(false);
  const [leadSearch, setLeadSearch] = React.useState('');
  const [leadResults, setLeadResults] = React.useState<any[]>([]);
  const [selectedLead, setSelectedLead] = React.useState<any | null>(initialLead || null);
  
  const [selectedStudent, setSelectedStudent] = React.useState<string>('');
  const [selectedRequirement, setSelectedRequirement] = React.useState<string>('');
  
  const [date, setDate] = React.useState('');
  const [startTime, setStartTime] = React.useState('');
  const [endTime, setEndTime] = React.useState('');

  React.useEffect(() => {
    if (initialLead) {
      setSelectedLead(initialLead);
      if (initialLead.students?.length === 1) {
        setSelectedStudent(initialLead.students[0].id);
        if (initialLead.students[0].requirements?.length === 1) {
          setSelectedRequirement(initialLead.students[0].requirements[0].id);
        }
      }
    }
  }, [initialLead]);

  React.useEffect(() => {
    const timer = setTimeout(async () => {
      if (leadSearch.length > 2 && !selectedLead && !initialLead) {
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
  }, [leadSearch, selectedLead, initialLead]);

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
    if (!selectedStudent || !selectedRequirement) {
      alert('Please select a student and requirement');
      return;
    }
    
    if (duration < 15) {
      alert('Duration must be at least 15 minutes.');
      return;
    }

    setIsLoading(true);

    try {
      const dateObj = new Date(`${date}T${startTime}`);
      await bookDemo({
        studentId: selectedStudent,
        requirementId: selectedRequirement,
        scheduledAt: dateObj.toISOString(),
        durationMinutes: duration,
      });
      
      onSuccess();
    } catch (err: any) {
      alert(err.message || 'Failed to book demo');
    } finally {
      setIsLoading(false);
    }
  };

  const getStudentOptions = () => {
    if (!selectedLead || !selectedLead.students) return [];
    return selectedLead.students;
  };

  const getRequirementOptions = () => {
    if (!selectedLead || !selectedStudent) return [];
    const student = selectedLead.students.find((s: any) => s.id === selectedStudent);
    if (!student || !student.requirements) return [];
    return student.requirements;
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="flex items-center gap-3 mb-6 pb-4 border-b border-slate-100 mt-2">
        <div className="h-10 w-10 bg-brand-50 text-brand-600 rounded-xl flex items-center justify-center">
          <Video className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-800">Book Demo</h2>
          <p className="text-sm text-slate-500">Schedule a trial session for the student</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        
        {!initialLead && (
          <div className="space-y-4 bg-slate-50/50 p-4 rounded-xl border border-slate-100">
            <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2 mb-2">
              <Search className="w-4 h-4 text-slate-400" />
              Search Lead
            </h3>
            {!selectedLead ? (
              <div className="relative">
                <Input 
                  value={leadSearch}
                  onChange={(e) => setLeadSearch(e.target.value)}
                  placeholder="Search by name, email, or phone..."
                />
                {leadResults.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-md shadow-lg max-h-60 overflow-auto">
                    {leadResults.map((lead) => (
                      <button
                        key={lead.id}
                        type="button"
                        className="w-full text-left px-4 py-2 text-sm hover:bg-slate-50 focus:bg-slate-50"
                        onClick={() => setSelectedLead(lead)}
                      >
                        <div className="font-medium text-slate-900">{lead.firstName} {lead.lastName}</div>
                        <div className="text-slate-500 text-xs">{lead.email || lead.phone}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-between p-3 bg-white border border-slate-200 rounded-md">
                <div>
                  <div className="text-sm font-medium text-slate-900">{selectedLead.firstName} {selectedLead.lastName}</div>
                </div>
                <button 
                  type="button" 
                  onClick={() => { setSelectedLead(null); setSelectedStudent(''); setSelectedRequirement(''); }}
                  className="text-xs text-red-600 hover:text-red-700 font-medium bg-red-50 px-2 py-1 rounded"
                >
                  Change
                </button>
              </div>
            )}
          </div>
        )}

        {selectedLead && (
          <div className="space-y-4 bg-slate-50/50 p-4 rounded-xl border border-slate-100">
            <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2 mb-2">
              <User className="w-4 h-4 text-slate-400" />
              Student Details
            </h3>
            
            <div className="grid gap-4">
              <div>
                <label className="text-sm font-medium text-slate-700 mb-1.5 block">Student *</label>
                <select 
                  value={selectedStudent}
                  onChange={(e) => {
                    setSelectedStudent(e.target.value);
                    setSelectedRequirement('');
                  }}
                  className="flex h-10 w-full items-center justify-between rounded-md border border-slate-300 bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-colors"
                  required
                >
                  <option value="">Select a student...</option>
                  {getStudentOptions().map((s: any) => (
                    <option key={s.id} value={s.id}>{s.firstName} {s.lastName}</option>
                  ))}
                </select>
              </div>

              {selectedStudent && (
                <div>
                  <label className="text-sm font-medium text-slate-700 mb-1.5 block">Requirement *</label>
                  <select 
                    value={selectedRequirement}
                    onChange={(e) => setSelectedRequirement(e.target.value)}
                    className="flex h-10 w-full items-center justify-between rounded-md border border-slate-300 bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-colors"
                    required
                  >
                    <option value="">Select a requirement...</option>
                    {getRequirementOptions().map((r: any) => (
                      <option key={r.id} value={r.id}>
                        {r.subject?.name} - {r.grade?.name} ({r.curriculum?.name})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {getStudentOptions().length === 0 && (
                <div className="p-3 bg-amber-50 text-amber-800 rounded-lg text-sm border border-amber-200">
                  This Lead does not have an enrolled Student and Requirement yet. Please add them from the Lead Detail page first.
                </div>
              )}
            </div>
          </div>
        )}

        <div className="space-y-4 bg-slate-50/50 p-4 rounded-xl border border-slate-100">
          <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2 mb-2">
            <Calendar className="w-4 h-4 text-slate-400" />
            Schedule Time
          </h3>
          
          <div>
            <label className="text-sm font-medium text-slate-700 mb-1.5 block">Date *</label>
            <Input 
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
              disabled={!selectedRequirement}
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
                  disabled={!selectedRequirement}
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
                  disabled={!selectedRequirement}
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

        <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
          <Button type="button" variant="outline" onClick={onClose} className="w-24">
            Cancel
          </Button>
          <Button 
            type="submit" 
            isLoading={isLoading} 
            disabled={!selectedRequirement || !date || !startTime || !endTime || duration <= 0}
            className="w-32"
          >
            {isLoading ? 'Booking...' : 'Book Demo'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
