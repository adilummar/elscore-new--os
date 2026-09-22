"use client";

import * as React from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { createStudentAction, updateStudentAction, saveStudentBundleAction } from '../../actions';
import { getSubjectsAction, getGradesAction, getCurriculaAction } from '@/app/(app)/settings/actions';
import { Plus, Trash } from 'lucide-react';

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

  // References
  const [subjectsRef, setSubjectsRef] = React.useState<any[]>([]);
  const [gradesRef, setGradesRef] = React.useState<any[]>([]);
  const [curriculaRef, setCurriculaRef] = React.useState<any[]>([]);

  // Base Info
  const [firstName, setFirstName] = React.useState('');
  const [lastName, setLastName] = React.useState('');
  const [schoolName, setSchoolName] = React.useState('');
  const [currentGrade, setCurrentGrade] = React.useState('');
  const [notes, setNotes] = React.useState('');

  // Academic Info (Requirements mapped)
  const [curriculumId, setCurriculumId] = React.useState('');
  const [gradeId, setGradeId] = React.useState('');
  const [subjectIds, setSubjectIds] = React.useState<string[]>([]);

  React.useEffect(() => {
    if (isOpen) {
      getSubjectsAction().then(res => setSubjectsRef(res.data || [])).catch(() => {});
      getGradesAction().then(res => setGradesRef(res.data || [])).catch(() => {});
      getCurriculaAction().then(res => setCurriculaRef(res.data || [])).catch(() => {});
      
      setFirstName(student?.firstName || '');
      setLastName(student?.lastName || '');
      setSchoolName(student?.schoolName || '');
      setCurrentGrade(student?.currentGrade || '');
      setNotes(student?.notes || '');
      
      // Try to auto-populate curriculum and grade from existing requirements
      const defaultCurriculum = student?.requirements?.[0]?.curriculumId || '';
      const defaultGrade = student?.requirements?.[0]?.gradeId || '';
      const existingSubjects = student?.requirements?.map((r: any) => r.subjectId) || [];
      
      setCurriculumId(defaultCurriculum);
      setGradeId(defaultGrade);
      setSubjectIds(existingSubjects);
      setError(null);
    }
  }, [isOpen, student]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim()) {
      setError('First name is required');
      return;
    }
    if (!curriculumId) {
      setError('Curriculum is required');
      return;
    }
    if (!gradeId) {
      setError('Target Grade is required');
      return;
    }
    if (subjectIds.length === 0 || subjectIds.some(id => !id)) {
      setError('At least one valid subject is required');
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
        curriculumId,
        gradeId,
        subjectIds,
        leadId
      };

      await saveStudentBundleAction({ ...payload, studentId: student?.id });
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save student');
    } finally {
      setLoading(false);
    }
  };

  const addSubject = () => setSubjectIds([...subjectIds, '']);
  const removeSubject = (index: number) => {
    const newSubs = [...subjectIds];
    newSubs.splice(index, 1);
    setSubjectIds(newSubs);
  };
  const updateSubject = (index: number, val: string) => {
    const newSubs = [...subjectIds];
    newSubs[index] = val;
    setSubjectIds(newSubs);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <h2 className="text-lg font-bold mb-4">{student ? 'Edit Student' : 'Add Student'}</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <div className="p-3 bg-red-50 text-red-600 rounded-md text-sm">{error}</div>}
        
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">First Name *</label>
            <Input value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Student first name" required />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Last Name</label>
            <Input value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Student last name" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Curriculum *</label>
            <Select required value={curriculumId} onChange={e => setCurriculumId(e.target.value)}>
              <option value="">Select Curriculum...</option>
              {curriculaRef.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Target Grade *</label>
            <Select required value={gradeId} onChange={e => setGradeId(e.target.value)}>
              <option value="">Select Grade...</option>
              {gradesRef.map(g => <option key={g.id} value={g.id}>{g.code.replace('_', ' ')}</option>)}
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <label className="text-sm font-medium">Subjects *</label>
            <Button type="button" variant="ghost" size="sm" onClick={addSubject} className="text-brand-600">
              <Plus className="w-4 h-4 mr-1" /> Add Subject
            </Button>
          </div>
          {subjectIds.length === 0 && (
             <p className="text-xs text-slate-500 italic">No subjects added for this student.</p>
          )}
          {subjectIds.map((subId, index) => (
             <div key={index} className="flex gap-2 items-center">
               <Select required value={subId} onChange={e => updateSubject(index, e.target.value)}>
                 <option value="">Select Subject...</option>
                 {subjectsRef.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
               </Select>
               <Button type="button" variant="ghost" className="text-rose-500 p-2" onClick={() => removeSubject(index)}>
                 <Trash className="w-4 h-4" />
               </Button>
             </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">School</label>
            <Input value={schoolName} onChange={e => setSchoolName(e.target.value)} placeholder="School name" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Current Grade</label>
            <Input value={currentGrade} onChange={e => setCurrentGrade(e.target.value)} placeholder="e.g. 10, 12, A-Levels" />
          </div>
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
