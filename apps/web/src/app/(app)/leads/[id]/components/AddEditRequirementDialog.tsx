"use client";

import * as React from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { createRequirementAction, updateRequirementAction, getReferenceDataAction } from '../../actions';

export function AddEditRequirementDialog({
  student,
  requirement,
  isOpen,
  onClose,
  onSuccess
}: {
  student: any;
  requirement?: any;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [loading, setLoading] = React.useState(false);
  const [fetchingRefs, setFetchingRefs] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [subjects, setSubjects] = React.useState<any[]>([]);
  const [curriculums, setCurriculums] = React.useState<any[]>([]);
  const [grades, setGrades] = React.useState<any[]>([]);

  const defaultCurriculum = student?.requirements?.[0]?.curriculumId || '';
  const defaultGrade = student?.requirements?.[0]?.gradeId || '';

  const [subjectId, setSubjectId] = React.useState(requirement?.subjectId || '');
  const [curriculumId, setCurriculumId] = React.useState(requirement?.curriculumId || defaultCurriculum);
  const [gradeId, setGradeId] = React.useState(requirement?.gradeId || defaultGrade);
  const [notes, setNotes] = React.useState(requirement?.notes || '');

  React.useEffect(() => {
    if (isOpen) {
      setSubjectId(requirement?.subjectId || '');
      setCurriculumId(requirement?.curriculumId || defaultCurriculum);
      setGradeId(requirement?.gradeId || defaultGrade);
      setNotes(requirement?.notes || '');
      setError(null);
      loadReferenceData();
    }
  }, [isOpen, requirement, defaultCurriculum, defaultGrade]);

  const loadReferenceData = async () => {
    setFetchingRefs(true);
    try {
      const [subRes, curRes, gradRes] = await Promise.all([
        getReferenceDataAction('subjects'),
        getReferenceDataAction('curricula'),
        getReferenceDataAction('grades')
      ]);
      setSubjects(subRes.data || []);
      setCurriculums(curRes.data || []);
      setGrades(gradRes.data || []);
    } catch (err: any) {
      setError('Failed to load reference data. ' + err.message);
    } finally {
      setFetchingRefs(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subjectId || !curriculumId || !gradeId) {
      setError('Subject, Curriculum, and Grade are required');
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      const payload = {
        subjectId,
        curriculumId,
        gradeId,
        notes,
      };

      if (requirement) {
        await updateRequirementAction(requirement.id, payload);
      } else {
        await createRequirementAction(student.id, payload);
      }
      
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save subject');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <h2 className="text-lg font-bold mb-4">{requirement ? 'Edit Subject' : 'Add Subject'}</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <div className="p-3 bg-red-50 text-red-600 rounded-md text-sm">{error}</div>}
        
        {fetchingRefs ? (
          <div className="py-8 text-center text-slate-500">Loading reference data...</div>
        ) : (
          <>
            <div className="space-y-2">
              <label className="text-sm font-medium">Subject *</label>
              <Select 
                value={subjectId} 
                onChange={e => setSubjectId(e.target.value)}
                required
              >
                <option value="">Select Subject</option>
                {subjects.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </Select>
            </div>

            {(!defaultCurriculum || !defaultGrade || requirement) && (
              <>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Curriculum *</label>
                  <Select 
                    value={curriculumId} 
                    onChange={e => setCurriculumId(e.target.value)}
                    required
                  >
                    <option value="">Select Curriculum</option>
                    {curriculums.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Target Grade *</label>
                  <Select 
                    value={gradeId} 
                    onChange={e => setGradeId(e.target.value)}
                    required
                  >
                    <option value="">Select Grade</option>
                    {grades.map(g => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </Select>
                </div>
              </>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium">Notes</label>
              <textarea
                className="w-full min-h-[80px] p-2 border border-slate-200 rounded-md text-sm"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Any specific notes for this subject..."
              />
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
              <Button type="button" variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
              <Button type="submit" disabled={loading || !subjectId || !curriculumId || !gradeId}>
                {loading ? 'Saving...' : 'Save Subject'}
              </Button>
            </div>
          </>
        )}
      </form>
    </Modal>
  );
}
