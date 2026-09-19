"use client";

import * as React from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { createStudentAction, updateStudentAction } from '../../actions';

export function AddEditStudentDialog({
  leadId,
  student,
  isOpen,
  onClose,
  onSuccess
}: {
  leadId: string;
  student?: any;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [firstName, setFirstName] = React.useState(student?.firstName || '');
  const [lastName, setLastName] = React.useState(student?.lastName || '');
  const [schoolName, setSchoolName] = React.useState(student?.schoolName || '');
  const [currentGrade, setCurrentGrade] = React.useState(student?.currentGrade || '');
  const [notes, setNotes] = React.useState(student?.notes || '');

  React.useEffect(() => {
    if (isOpen) {
      setFirstName(student?.firstName || '');
      setLastName(student?.lastName || '');
      setSchoolName(student?.schoolName || '');
      setCurrentGrade(student?.currentGrade || '');
      setNotes(student?.notes || '');
      setError(null);
    }
  }, [isOpen, student]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim()) {
      setError('First name is required');
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      const payload = {
        firstName,
        lastName,
        schoolName,
        currentGrade,
        notes,
        ...(student ? {} : { leadId }) // leadId only required for creation
      };

      if (student) {
        await updateStudentAction(student.id, payload, leadId);
      } else {
        await createStudentAction(payload);
      }
      
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save student');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <h2 className="text-lg font-bold mb-4">{student ? 'Edit Student' : 'Add Student'}</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <div className="p-3 bg-red-50 text-red-600 rounded-md text-sm">{error}</div>}
        
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">First Name *</label>
            <Input 
              value={firstName} 
              onChange={e => setFirstName(e.target.value)} 
              placeholder="Student first name"
              required
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Last Name</label>
            <Input 
              value={lastName} 
              onChange={e => setLastName(e.target.value)} 
              placeholder="Student last name"
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">School</label>
          <Input 
            value={schoolName} 
            onChange={e => setSchoolName(e.target.value)} 
            placeholder="School name"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Current Grade</label>
          <Input 
            value={currentGrade} 
            onChange={e => setCurrentGrade(e.target.value)} 
            placeholder="e.g. 10, 12, A-Levels"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Notes</label>
          <textarea
            className="w-full min-h-[80px] p-2 border border-slate-200 rounded-md text-sm"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Any specific notes about the student..."
          />
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
          <Button type="button" variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button type="submit" disabled={loading || !firstName.trim()}>
            {loading ? 'Saving...' : 'Save Student'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
