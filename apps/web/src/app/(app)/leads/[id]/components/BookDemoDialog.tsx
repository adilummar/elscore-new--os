"use client";

import * as React from 'react';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { bookDemoAction } from '../../actions';
import { AddEditRequirementDialog } from './AddEditRequirementDialog';
import { Calendar, Clock, User, ArrowRight, Video, BookOpen } from 'lucide-react';

export function BookDemoDialog({ lead, isOpen, onClose, onSuccess }: { lead: any, isOpen: boolean, onClose: () => void, onSuccess: () => void }) {
  const [studentId, setStudentId] = React.useState('');
  const [requirementId, setRequirementId] = React.useState('');
  const [date, setDate] = React.useState('');
  const [startTime, setStartTime] = React.useState('');
  const [endTime, setEndTime] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [isAddSubjectOpen, setIsAddSubjectOpen] = React.useState(false);

  const students = lead.students || [];
  const selectedStudent = students.find((s: any) => s.id === studentId);
  const requirements = selectedStudent?.requirements || [];

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
      alert("Duration must be at least 15 minutes.");
      return;
    }
    setLoading(true);
    try {
      await bookDemoAction(studentId, requirementId, new Date(`${date}T${startTime}`).toISOString(), duration);
      onSuccess();
      onClose();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
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
      
      {students.length === 0 ? (
        <div className="text-center py-8 px-4 bg-slate-50 rounded-xl border border-slate-100">
          <User className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-600 font-medium">No students found</p>
          <p className="text-slate-500 text-sm mt-1 mb-4">You must add a student and requirement first.</p>
          <Button onClick={onClose}>Close</Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-4 bg-slate-50/50 p-4 rounded-xl border border-slate-100">
            <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2 mb-2">
              <User className="w-4 h-4 text-slate-400" />
              Student Details
            </h3>
            <div className="grid gap-4">
              <div>
                <label className="text-sm font-medium text-slate-700 mb-1.5 block">Student *</label>
                <Select required value={studentId} onChange={e => {
                  setStudentId(e.target.value);
                  setRequirementId('');
                }}>
                  <option value="">Select Student...</option>
                  {students.map((s: any) => (
                    <option key={s.id} value={s.id}>{s.firstName} {s.lastName}</option>
                  ))}
                </Select>
              </div>
              
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="text-sm font-medium text-slate-700">Subject *</label>
                  {studentId && (
                    <button 
                      type="button" 
                      onClick={() => setIsAddSubjectOpen(true)}
                      className="text-xs text-brand-600 hover:text-brand-800 font-medium bg-brand-50 hover:bg-brand-100 px-2 py-1 rounded transition-colors"
                    >
                      + Add New Subject
                    </button>
                  )}
                </div>
                <Select required value={requirementId} onChange={e => setRequirementId(e.target.value)} disabled={!studentId}>
                  <option value="">Select Subject...</option>
                  {requirements.map((r: any) => (
                    <option key={r.id} value={r.id}>{r.subject?.name}</option>
                  ))}
                </Select>
              </div>
            </div>
          </div>

          <div className="space-y-4 bg-slate-50/50 p-4 rounded-xl border border-slate-100">
            <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2 mb-2">
              <Calendar className="w-4 h-4 text-slate-400" />
              Schedule Time
            </h3>
            
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1.5 block">Date *</label>
              <Input type="date" required value={date} onChange={e => setDate(e.target.value)} className="w-full" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-slate-700 mb-1.5 block">From *</label>
                <div className="relative">
                  <Input type="time" required value={startTime} onChange={handleStartTimeChange} className="w-full pl-9" />
                  <Clock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700 mb-1.5 block">To *</label>
                <div className="relative">
                  <Input type="time" required value={endTime} onChange={e => setEndTime(e.target.value)} className="w-full pl-9" />
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
            <Button type="button" variant="outline" onClick={onClose} className="w-24">Cancel</Button>
            <Button type="submit" disabled={loading || duration <= 0} className="w-32">
              {loading ? 'Booking...' : 'Book Demo'}
            </Button>
          </div>
        </form>
      )}

      {isAddSubjectOpen && selectedStudent && (
        <AddEditRequirementDialog
          student={selectedStudent}
          isOpen={isAddSubjectOpen}
          onClose={() => setIsAddSubjectOpen(false)}
          onSuccess={() => {
            onSuccess(); // Refresh lead
            setIsAddSubjectOpen(false);
          }}
        />
      )}
    </Modal>
  );
}
