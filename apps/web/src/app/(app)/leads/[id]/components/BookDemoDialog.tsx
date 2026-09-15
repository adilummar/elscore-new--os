"use client";

import * as React from 'react';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { bookDemoAction } from '../../actions';

export function BookDemoDialog({ lead, isOpen, onClose, onSuccess }: { lead: any, isOpen: boolean, onClose: () => void, onSuccess: () => void }) {
  const [studentId, setStudentId] = React.useState('');
  const [requirementId, setRequirementId] = React.useState('');
  const [scheduledAt, setScheduledAt] = React.useState('');
  const [duration, setDuration] = React.useState(30);
  const [loading, setLoading] = React.useState(false);

  const students = lead.students || [];
  const selectedStudent = students.find((s: any) => s.id === studentId);
  const requirements = selectedStudent?.requirements || [];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await bookDemoAction(studentId, requirementId, new Date(scheduledAt).toISOString(), Number(duration));
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
      <h2 className="text-lg font-bold mb-4">Book Demo</h2>
      
      {students.length === 0 ? (
        <div className="text-center py-6">
          <p className="text-slate-500">This lead has no students. You must add a student and requirement first.</p>
          <Button className="mt-4" onClick={onClose}>Close</Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-medium">Student *</label>
            <Select required value={studentId} onChange={e => setStudentId(e.target.value)}>
              <option value="">Select Student...</option>
              {students.map((s: any) => (
                <option key={s.id} value={s.id}>{s.firstName} {s.lastName}</option>
              ))}
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium">Requirement *</label>
            <Select required value={requirementId} onChange={e => setRequirementId(e.target.value)} disabled={!studentId}>
              <option value="">Select Requirement...</option>
              {requirements.map((r: any) => (
                <option key={r.id} value={r.id}>{r.subject?.name} - {r.grade?.name}</option>
              ))}
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium">Date & Time *</label>
            <Input type="datetime-local" required value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium">Duration (Minutes) *</label>
            <Input type="number" min={30} max={120} required value={duration} onChange={e => setDuration(Number(e.target.value))} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={loading}>Book Demo</Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
