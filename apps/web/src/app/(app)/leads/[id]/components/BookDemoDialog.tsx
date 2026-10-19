"use client";

import * as React from 'react';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { bookDemoAction, saveStudentBundleAction } from '../../actions';
import { getSubjectsAction, getGradesAction, getCurriculaAction } from '@/app/(app)/settings/actions';
import { AddEditRequirementDialog } from './AddEditRequirementDialog';
import {
  Calendar,
  Clock,
  User,
  ArrowRight,
  Video,
  Plus,
  Trash2,
  AlertCircle,
} from 'lucide-react';

interface SessionRow {
  subjectId: string;
  requirementId: string;
  startTime: string;
  endTime: string;
}

interface SubjectOption {
  id: string;
  name: string;
  requirementId?: string;
  isExisting: boolean;
}

export function BookDemoDialog({
  lead,
  isOpen,
  onClose,
  onSuccess,
}: {
  lead: any;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const students = React.useMemo(() => lead.students || [], [lead.students]);
  const hasExistingStudents = students.length > 0;

  // Student selection or inline creation state
  const [studentId, setStudentId] = React.useState(students.length === 1 ? students[0].id : '');
  const [newStudentFirstName, setNewStudentFirstName] = React.useState(lead.firstName || '');
  const [newStudentLastName, setNewStudentLastName] = React.useState(lead.lastName || '');
  const [newCurriculumId, setNewCurriculumId] = React.useState('');
  const [newGradeId, setNewGradeId] = React.useState('');

  // Reference catalog
  const [subjectsRef, setSubjectsRef] = React.useState<any[]>([]);
  const [gradesRef, setGradesRef] = React.useState<any[]>([]);
  const [curriculaRef, setCurriculaRef] = React.useState<any[]>([]);

  // Schedule & session rows
  const [date, setDate] = React.useState('');
  const [sessionRows, setSessionRows] = React.useState<SessionRow[]>([
    { subjectId: '', requirementId: '', startTime: '10:00', endTime: '11:00' },
  ]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [isAddSubjectOpen, setIsAddSubjectOpen] = React.useState(false);

  React.useEffect(() => {
    if (isOpen) {
      getSubjectsAction()
        .then(res => setSubjectsRef(res?.data || []))
        .catch(() => {});
      getGradesAction()
        .then(res => setGradesRef(res?.data || []))
        .catch(() => {});
      getCurriculaAction()
        .then(res => setCurriculaRef(res?.data || []))
        .catch(() => {});

      if (!studentId && students.length === 1) {
        setStudentId(students[0].id);
      }
      setNewStudentFirstName(lead.firstName || '');
      setNewStudentLastName(lead.lastName || '');
    }
  }, [isOpen, students, studentId, lead.firstName, lead.lastName]);

  const selectedStudent = students.find((s: any) => s.id === studentId);
  const studentRequirements = React.useMemo(
    () => selectedStudent?.requirements || [],
    [selectedStudent],
  );

  const effectiveCurriculumId =
    selectedStudent?.curriculumId || studentRequirements[0]?.curriculumId || newCurriculumId;
  const effectiveGradeId =
    selectedStudent?.gradeId || studentRequirements[0]?.gradeId || newGradeId;

  // Build selectable subjects list
  const availableSubjectOptions: SubjectOption[] = React.useMemo(() => {
    if (subjectsRef.length > 0) {
      return subjectsRef.map((s: any) => {
        const req = studentRequirements.find((r: any) => r.subjectId === s.id);
        return {
          id: s.id,
          name: s.name,
          requirementId: req?.id,
          isExisting: Boolean(req),
        };
      });
    }
    return studentRequirements.map((r: any) => ({
      id: r.subjectId || r.subject?.id,
      name: r.subject?.name || 'Subject',
      requirementId: r.id,
      isExisting: true,
    }));
  }, [subjectsRef, studentRequirements]);

  // Update a specific session row
  const handleSessionChange = (index: number, field: keyof SessionRow, value: string) => {
    setSessionRows(prev => {
      const updated = [...prev];
      const current = { ...updated[index], [field]: value };

      if (field === 'subjectId') {
        const req = studentRequirements.find((r: any) => r.subjectId === value);
        current.requirementId = req ? req.id : '';
      }

      // Auto-set end time when start time is picked and end time is empty or same
      if (field === 'startTime' && value) {
        const [h, m] = value.split(':').map(Number);
        const endH = Math.min(h + 1, 23);
        current.endTime = `${endH.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
      }

      updated[index] = current;
      return updated;
    });
  };

  const addSessionRow = () => {
    const lastSession = sessionRows[sessionRows.length - 1];
    let nextStart = '11:00';
    let nextEnd = '12:00';
    if (lastSession?.endTime) {
      nextStart = lastSession.endTime;
      const [h, m] = nextStart.split(':').map(Number);
      const endH = Math.min(h + 1, 23);
      nextEnd = `${endH.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
    }
    setSessionRows(prev => [
      ...prev,
      { subjectId: '', requirementId: '', startTime: nextStart, endTime: nextEnd },
    ]);
  };

  const removeSessionRow = (index: number) => {
    if (sessionRows.length <= 1) return;
    setSessionRows(prev => prev.filter((_, i) => i !== index));
  };

  // Validation calculations
  const sessionDurations = sessionRows.map(row => {
    if (!date || !row.startTime || !row.endTime) return 0;
    const s = new Date(`${date}T${row.startTime}`).getTime();
    const e = new Date(`${date}T${row.endTime}`).getTime();
    return Math.round((e - s) / 60000);
  });

  const totalDuration = sessionDurations.reduce((acc, d) => acc + (d > 0 ? d : 0), 0);

  // Check overlap among session rows
  let hasOverlap = false;
  let hasInvalidDuration = false;
  for (let i = 0; i < sessionRows.length; i++) {
    const dur = sessionDurations[i];
    if (dur < 15 || dur > 180) {
      hasInvalidDuration = true;
    }
    for (let j = i + 1; j < sessionRows.length; j++) {
      if (
        date &&
        sessionRows[i].startTime &&
        sessionRows[i].endTime &&
        sessionRows[j].startTime &&
        sessionRows[j].endTime
      ) {
        const s1 = new Date(`${date}T${sessionRows[i].startTime}`).getTime();
        const e1 = new Date(`${date}T${sessionRows[i].endTime}`).getTime();
        const s2 = new Date(`${date}T${sessionRows[j].startTime}`).getTime();
        const e2 = new Date(`${date}T${sessionRows[j].endTime}`).getTime();
        if (s1 < e2 && s2 < e1) {
          hasOverlap = true;
        }
      }
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (lead?.status !== 'INTERESTED') {
      setError(`Cannot book demo for a lead with status ${lead?.status || 'UNKNOWN'}. Lead must be in INTERESTED status to book a demo.`);
      return;
    }

    // Validate student
    if (!hasExistingStudents) {
      if (!newStudentFirstName.trim()) {
        setError('Please enter student first name.');
        return;
      }
      if (!newCurriculumId) {
        setError('Please select a curriculum.');
        return;
      }
      if (!newGradeId) {
        setError('Please select a grade.');
        return;
      }
    } else {
      if (!studentId) {
        setError('Please select a student.');
        return;
      }
      if (!effectiveCurriculumId) {
        setError('Please select a curriculum for this student.');
        return;
      }
      if (!effectiveGradeId) {
        setError('Please select a grade for this student.');
        return;
      }
    }

    if (!date) {
      setError('Please select a demo date.');
      return;
    }

    for (let i = 0; i < sessionRows.length; i++) {
      if (!sessionRows[i].subjectId) {
        setError(`Please select a subject for Session ${i + 1}.`);
        return;
      }
      if (sessionDurations[i] < 15) {
        setError(`Session ${i + 1} duration must be at least 15 minutes.`);
        return;
      }
      if (sessionDurations[i] > 180) {
        setError(`Session ${i + 1} duration cannot exceed 180 minutes.`);
        return;
      }
    }

    if (hasOverlap) {
      setError('Sessions cannot have overlapping time ranges.');
      return;
    }

    setLoading(true);
    try {
      let targetStudentId = studentId;
      let targetRequirements = studentRequirements;

      const chosenSubjectIds = Array.from(
        new Set(sessionRows.map(r => r.subjectId).filter(Boolean)),
      );

      // Phase 1: Self-healing inline student & requirement provisioning
      if (!targetStudentId) {
        const bundleRes = await saveStudentBundleAction({
          leadId: lead.id,
          firstName: newStudentFirstName.trim(),
          lastName: newStudentLastName.trim() || undefined,
          curriculumId: newCurriculumId,
          gradeId: newGradeId,
          subjectIds: chosenSubjectIds,
        });

        const createdStudent = bundleRes?.data || bundleRes;
        if (!createdStudent?.id) {
          throw new Error('Failed to auto-provision student profile for demo');
        }
        targetStudentId = createdStudent.id;
        setStudentId(createdStudent.id);
        targetRequirements = createdStudent.requirements || [];
      } else {
        const existingSubjectIds = (targetRequirements || []).map((r: any) => r.subjectId);
        const missingSubjects = chosenSubjectIds.filter(id => !existingSubjectIds.includes(id));

        if (missingSubjects.length > 0 || (targetRequirements || []).length === 0) {
          const allSubjectIds = Array.from(new Set([...existingSubjectIds, ...chosenSubjectIds]));
          const bundleRes = await saveStudentBundleAction({
            leadId: lead.id,
            studentId: targetStudentId,
            firstName: selectedStudent?.firstName || newStudentFirstName.trim(),
            lastName: selectedStudent?.lastName || newStudentLastName.trim() || undefined,
            curriculumId: effectiveCurriculumId,
            gradeId: effectiveGradeId,
            subjectIds: allSubjectIds,
          });

          const updatedStudent = bundleRes?.data || bundleRes;
          if (updatedStudent?.requirements) {
            targetRequirements = updatedStudent.requirements;
          }
        }
      }

      // Generate idempotency key
      const idempotencyKey =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `bkg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

      // Map sessions to requirement IDs
      const sessions = sessionRows.map((row, idx) => {
        let req = targetRequirements.find((r: any) => r.subjectId === row.subjectId);
        if (!req) {
          req = targetRequirements[0];
        }

        const startIso = new Date(`${date}T${row.startTime}`).toISOString();
        const endIso = new Date(`${date}T${row.endTime}`).toISOString();

        return {
          sessionOrder: idx + 1,
          requirementId: req?.id,
          subjectId: row.subjectId,
          curriculumId: req?.curriculumId || effectiveCurriculumId,
          gradeId: req?.gradeId || effectiveGradeId,
          scheduledStart: startIso,
          scheduledEnd: endIso,
          durationMinutes: sessionDurations[idx],
        };
      });

      const payload = {
        leadId: lead.id,
        studentId: targetStudentId,
        requirementId: sessions[0].requirementId,
        scheduledAt: sessions[0].scheduledStart,
        durationMinutes: totalDuration,
        idempotencyKey,
        sessions,
      };

      await bookDemoAction(payload);
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to book demo.');
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
          <p className="text-sm text-slate-500">Schedule multi-session or single-session trial for student</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 p-3 mb-6 bg-slate-50 border border-slate-100 rounded-xl text-xs text-slate-600">
        <div>
          <span className="font-semibold text-slate-700">Lead:</span> {lead.firstName} {lead.lastName || ''} {lead.businessId ? `(${lead.businessId})` : ''}
        </div>
        {lead.phone && (
          <div className="flex items-center gap-1">
            <span className="font-semibold text-slate-700">Phone:</span>
            <span className="font-mono font-medium text-slate-800">
              {lead.countryCode ? `+${lead.countryCode.replace(/^\+/, '')} ` : ''}{lead.phone}
            </span>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {lead?.status !== 'INTERESTED' && (
          <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0 text-amber-600" />
            <span>This lead is currently in <strong>{lead?.status || 'UNKNOWN'}</strong> status. Demos can only be booked for leads in <strong>INTERESTED</strong> status.</span>
          </div>
        )}
        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* SECTION: Student Profile */}
        {!hasExistingStudents ? (
          <div className="space-y-3 bg-brand-50/40 p-4 rounded-xl border border-brand-100">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                <User className="w-4 h-4 text-brand-600" />
                Student Profile Setup
              </h3>
              <span className="text-xs bg-brand-100 text-brand-700 px-2.5 py-0.5 rounded-full font-medium">
                Auto-provisioning
              </span>
            </div>
            <p className="text-xs text-slate-500">
              No registered students found for this lead. Enter student and curriculum details below to auto-provision their profile and link the demo.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label className="text-xs font-medium text-slate-700 mb-1 block">First Name *</label>
                <Input
                  required
                  value={newStudentFirstName}
                  onChange={e => setNewStudentFirstName(e.target.value)}
                  placeholder="e.g. Arjun"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-700 mb-1 block">Last Name</label>
                <Input
                  value={newStudentLastName}
                  onChange={e => setNewStudentLastName(e.target.value)}
                  placeholder="e.g. Kumar"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-700 mb-1 block">Curriculum *</label>
                <Select
                  required
                  value={newCurriculumId}
                  onChange={e => setNewCurriculumId(e.target.value)}
                >
                  <option value="">Select Curriculum...</option>
                  {curriculaRef.map((c: any) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-700 mb-1 block">Grade *</label>
                <Select
                  required
                  value={newGradeId}
                  onChange={e => setNewGradeId(e.target.value)}
                >
                  <option value="">Select Grade...</option>
                  {gradesRef.map((g: any) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4 bg-slate-50/50 p-4 rounded-xl border border-slate-100">
            <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <User className="w-4 h-4 text-slate-400" />
              Student Selection
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-slate-700 mb-1.5 block">Student *</label>
                <Select
                  required
                  value={studentId}
                  onChange={e => {
                    setStudentId(e.target.value);
                  }}
                >
                  <option value="">Select Student...</option>
                  {students.map((s: any) => (
                    <option key={s.id} value={s.id}>
                      {s.firstName} {s.lastName}
                    </option>
                  ))}
                </Select>
              </div>

              {(!effectiveCurriculumId || !effectiveGradeId) && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs font-medium text-slate-700 mb-1 block">Curriculum *</label>
                    <Select
                      required
                      value={newCurriculumId}
                      onChange={e => setNewCurriculumId(e.target.value)}
                    >
                      <option value="">Select...</option>
                      {curriculaRef.map((c: any) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-700 mb-1 block">Grade *</label>
                    <Select
                      required
                      value={newGradeId}
                      onChange={e => setNewGradeId(e.target.value)}
                    >
                      <option value="">Select...</option>
                      {gradesRef.map((g: any) => (
                        <option key={g.id} value={g.id}>{g.name}</option>
                      ))}
                    </Select>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* SECTION: Demo Date */}
        <div className="space-y-2 bg-slate-50/50 p-4 rounded-xl border border-slate-100">
          <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-slate-400" />
            Demo Date *
          </label>
          <Input
            type="date"
            required
            value={date}
            onChange={e => setDate(e.target.value)}
            className="w-full sm:w-1/2"
          />
        </div>

        {/* SECTION: Sessions Configuration */}
        <div className="space-y-4 bg-slate-50/50 p-4 rounded-xl border border-slate-100">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-slate-400" />
              Sessions ({sessionRows.length})
            </h3>
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

          <div className="space-y-3">
            {sessionRows.map((row, index) => {
              const dur = sessionDurations[index];
              return (
                <div key={index} className="p-3 bg-white rounded-lg border border-slate-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      Session {index + 1}
                    </span>
                    {sessionRows.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeSessionRow(index)}
                        className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50 transition-colors"
                        title="Remove session"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs font-medium text-slate-600 mb-1 block">Subject *</label>
                      <Select
                        required
                        value={row.subjectId}
                        onChange={e => handleSessionChange(index, 'subjectId', e.target.value)}
                      >
                        <option value="">Select Subject...</option>
                        {availableSubjectOptions.map((opt: SubjectOption) => (
                          <option key={opt.id} value={opt.id}>
                            {opt.name}{opt.isExisting ? ' (Existing)' : ''}
                          </option>
                        ))}
                      </Select>
                    </div>

                    <div>
                      <label className="text-xs font-medium text-slate-600 mb-1 block">Start Time *</label>
                      <div className="relative">
                        <Input
                          type="time"
                          required
                          value={row.startTime}
                          onChange={e => handleSessionChange(index, 'startTime', e.target.value)}
                          className="w-full pl-8"
                        />
                        <Clock className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-medium text-slate-600 mb-1 block">End Time *</label>
                      <div className="relative">
                        <Input
                          type="time"
                          required
                          value={row.endTime}
                          onChange={e => handleSessionChange(index, 'endTime', e.target.value)}
                          className="w-full pl-8"
                        />
                        <Clock className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      </div>
                    </div>
                  </div>

                  {dur > 0 && (
                    <div className={`text-xs flex items-center gap-1.5 ${dur < 15 || dur > 180 ? 'text-red-500' : 'text-slate-500'}`}>
                      <ArrowRight className="w-3 h-3" />
                      <span>Duration: <strong>{dur} mins</strong></span>
                      {dur < 15 && <span className="text-red-500">(min 15 min)</span>}
                      {dur > 180 && <span className="text-red-500">(max 180 min)</span>}
                    </div>
                  )}
                  {dur <= 0 && row.startTime && row.endTime && (
                    <div className="text-xs text-red-500">End time must be after start time</div>
                  )}
                </div>
              );
            })}
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addSessionRow}
            className="w-full flex items-center justify-center gap-1 text-slate-600 border-dashed"
          >
            <Plus className="w-4 h-4" /> Add Another Subject Session
          </Button>

          {totalDuration > 0 && (
            <div className="text-sm pt-2 flex items-center justify-between border-t border-slate-200">
              <span className="text-slate-600 font-medium">Total Demo Duration:</span>
              <span className="font-bold text-brand-700">
                {totalDuration} minutes ({sessionRows.length} {sessionRows.length === 1 ? 'session' : 'sessions'})
              </span>
            </div>
          )}
          {hasOverlap && (
            <div className="text-xs text-red-600 bg-red-50 p-2 rounded border border-red-100">
              Warning: Some sessions have overlapping time ranges. Please adjust the times.
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
          <Button type="button" variant="outline" onClick={onClose} className="w-24">
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={loading || totalDuration <= 0 || hasOverlap || hasInvalidDuration || lead?.status !== 'INTERESTED'}
            className="w-36"
          >
            {loading ? 'Booking...' : 'Book Demo'}
          </Button>
        </div>
      </form>

      {isAddSubjectOpen && selectedStudent && (
        <AddEditRequirementDialog
          student={selectedStudent}
          isOpen={isAddSubjectOpen}
          onClose={() => setIsAddSubjectOpen(false)}
          onSuccess={() => {
            onSuccess();
            setIsAddSubjectOpen(false);
          }}
        />
      )}
    </Modal>
  );
}
