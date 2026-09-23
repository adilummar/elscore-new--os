'use client';

import * as React from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { editDemo } from '../actions';
import { getLeadAction } from '../../leads/actions';
import { User, Edit } from 'lucide-react';

interface EditDemoModalProps {
  isOpen: boolean;
  onClose: () => void;
  demo: any;
  onSuccess: () => void;
  lead?: any; // To get the list of students/requirements
}

export function EditDemoModal({ isOpen, onClose, demo, onSuccess, lead }: EditDemoModalProps) {
  const [isLoading, setIsLoading] = React.useState(false);
  const [studentId, setStudentId] = React.useState('');
  const [requirementId, setRequirementId] = React.useState('');
  const [fetchedLead, setFetchedLead] = React.useState<any>(null);

  React.useEffect(() => {
    if (demo && isOpen) {
      setStudentId(demo.studentId || '');
      setRequirementId(demo.requirementId || '');
      
      if (!lead && demo.student?.leadId) {
        setIsLoading(true);
        getLeadAction(demo.student.leadId).then(res => {
           setFetchedLead(res);
           setIsLoading(false);
        }).catch(() => setIsLoading(false));
      }
    }
  }, [demo, isOpen, lead]);

  const actualLead = lead || fetchedLead;
  const students = actualLead?.students || [];
  const selectedStudent = students.find((s: any) => s.id === studentId) || demo?.student;
  const requirements = selectedStudent?.requirements || [];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setIsLoading(true);
    try {
      await editDemo(demo.id, {
        studentId: studentId,
        requirementId: requirementId,
      });
      onSuccess();
    } catch (err: any) {
      alert(err.message || 'Failed to edit demo');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="flex items-center gap-3 mb-6 pb-4 border-b border-slate-100 mt-2">
        <div className="h-10 w-10 bg-brand-50 text-brand-600 rounded-xl flex items-center justify-center">
          <Edit className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-800">Edit Demo Details</h2>
          <p className="text-sm text-slate-500">Update student and subject</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-4 bg-slate-50/50 p-4 rounded-xl border border-slate-100">
          <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2 mb-2">
            <User className="w-4 h-4 text-slate-400" />
            Student Details
          </h3>
          
          <div className="grid gap-4">
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1.5 block">Student *</label>
              <Select 
                required 
                value={studentId} 
                onChange={(e) => {
                  setStudentId(e.target.value);
                  setRequirementId('');
                }}
              >
                <option value="">Select Student...</option>
                {students.map((s: any) => (
                  <option key={s.id} value={s.id}>{s.firstName} {s.lastName}</option>
                ))}
              </Select>
            </div>
            
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1.5 block">Subject *</label>
              <Select 
                required 
                value={requirementId} 
                onChange={(e) => setRequirementId(e.target.value)} 
                disabled={!studentId}
              >
                <option value="">Select Subject...</option>
                {requirements.map((r: any) => (
                  <option key={r.id} value={r.id}>{r.subject?.name}</option>
                ))}
              </Select>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
          <Button type="button" variant="outline" onClick={onClose} className="w-24">
            Cancel
          </Button>
          <Button 
            type="submit" 
            isLoading={isLoading}
            disabled={!studentId || !requirementId || (studentId === demo?.studentId && requirementId === demo?.requirementId)}
            className="w-32"
          >
            {isLoading ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
