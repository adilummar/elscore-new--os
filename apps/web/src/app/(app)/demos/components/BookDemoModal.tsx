'use client';

import * as React from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { bookDemo, searchLeads } from '../actions';

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
  const [duration, setDuration] = React.useState('60');

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudent || !selectedRequirement) {
      alert('Please select a student and requirement');
      return;
    }
    
    const durNum = parseInt(duration, 10);
    if (durNum < 30 || durNum > 120) {
      alert('Duration must be between 30 and 120 minutes.');
      return;
    }

    setIsLoading(true);

    try {
      const dateObj = new Date(`${date}T${startTime}`);
      await bookDemo({
        studentId: selectedStudent,
        requirementId: selectedRequirement,
        scheduledAt: dateObj.toISOString(),
        durationMinutes: durNum,
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
      <h2 className="text-lg font-bold mb-4">Book Demo</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        
        {!initialLead && (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Search Lead</label>
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
              <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-md">
                <div>
                  <div className="text-sm font-medium text-slate-900">{selectedLead.firstName} {selectedLead.lastName}</div>
                </div>
                <button 
                  type="button" 
                  onClick={() => { setSelectedLead(null); setSelectedStudent(''); setSelectedRequirement(''); }}
                  className="text-xs text-red-600 hover:text-red-700 font-medium"
                >
                  Change
                </button>
              </div>
            )}
          </div>
        )}

        {selectedLead && (
          <>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Student</label>
              <select 
                value={selectedStudent}
                onChange={(e) => {
                  setSelectedStudent(e.target.value);
                  setSelectedRequirement('');
                }}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-shadow"
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
                <label className="block text-sm font-medium text-slate-700 mb-1">Requirement</label>
                <select 
                  value={selectedRequirement}
                  onChange={(e) => setSelectedRequirement(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-shadow"
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
          </>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Date</label>
            <Input 
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
              disabled={!selectedRequirement}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Start Time</label>
            <Input 
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              required
              disabled={!selectedRequirement}
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Duration (minutes)</label>
          <select 
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-shadow"
            disabled={!selectedRequirement}
          >
            <option value="30">30 minutes</option>
            <option value="45">45 minutes</option>
            <option value="60">60 minutes</option>
            <option value="90">90 minutes</option>
            <option value="120">120 minutes</option>
          </select>
        </div>

        <div className="pt-4 flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button 
            type="submit" 
            isLoading={isLoading} 
            disabled={!selectedRequirement || !date || !startTime}
          >
            Book Demo
          </Button>
        </div>
      </form>
    </Modal>
  );
}
