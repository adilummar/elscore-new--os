"use client";

import * as React from 'react';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Alert } from '@/components/ui/Alert';
import { createLeadAction } from '../actions';
import { getSubjectsAction, getGradesAction, getCurriculaAction } from '@/app/(app)/settings/actions';
import { useRouter } from 'next/navigation';
import { Plus, Trash, ArrowRight, ArrowLeft, Check, AlertCircle } from 'lucide-react';

interface RequirementForm {
  id: string;
  subjectId: string;
  curriculumId: string;
  gradeId: string;
  syllabus: string;
  notes: string;
}

interface StudentForm {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: string;
  schoolName: string;
  currentGrade: string;
  cityLocation: string;
  notes: string;
  requirements: RequirementForm[];
}

export function CreateLeadDialog({ isOpen, onClose, onSuccess }: { isOpen: boolean; onClose: () => void; onSuccess: () => void }) {
  const router = useRouter();
  const [step, setStep] = React.useState(1);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [validationErrors, setValidationErrors] = React.useState<Record<string, string>>({});
  const [warning, setWarning] = React.useState<any>(null);
  const [successData, setSuccessData] = React.useState<any>(null);

  // Reference Data
  const [subjects, setSubjects] = React.useState<any[]>([]);
  const [grades, setGrades] = React.useState<any[]>([]);
  const [curricula, setCurricula] = React.useState<any[]>([]);

  React.useEffect(() => {
    if (isOpen) {
      getSubjectsAction().then(res => setSubjects(res.data || [])).catch(() => {});
      getGradesAction().then(res => setGrades(res.data || [])).catch(() => {});
      getCurriculaAction().then(res => setCurricula(res.data || [])).catch(() => {});
    }
  }, [isOpen]);

  // Form State
  const [parent, setParent] = React.useState({
    firstName: '',
    lastName: '',
    primaryPhone: '',
    altPhone1: '',
    altPhone2: '',
    whatsappNumber: '',
    source: 'META_FACEBOOK',
  });

  const [students, setStudents] = React.useState<StudentForm[]>([]);

  const handleClose = () => {
    // UX Safety Check
    if (!successData && (parent.primaryPhone || students.length > 0)) {
      if (!window.confirm("You have unsaved changes. Are you sure you want to close?")) {
        return;
      }
    }
    resetForm();
    onClose();
  };

  const resetForm = () => {
    setStep(1);
    setParent({ firstName: '', lastName: '', primaryPhone: '', altPhone1: '', altPhone2: '', whatsappNumber: '', source: 'META_FACEBOOK' });
    setStudents([]);
    setError(null);
    setWarning(null);
    setSuccessData(null);
    setValidationErrors({});
  };

  // Student Actions
  const addStudent = () => {
    setStudents([...students, {
      id: crypto.randomUUID(),
      firstName: '',
      lastName: '',
      dateOfBirth: '',
      gender: '',
      schoolName: '',
      currentGrade: '',
      cityLocation: '',
      notes: '',
      requirements: []
    }]);
  };

  const removeStudent = (id: string) => {
    if (window.confirm("Are you sure you want to remove this student and all their requirements?")) {
      setStudents(students.filter(s => s.id !== id));
    }
  };

  const updateStudent = (id: string, field: string, value: string) => {
    setStudents(students.map(s => s.id === id ? { ...s, [field]: value } : s));
  };

  // Requirement Actions
  const addRequirement = (studentId: string) => {
    setStudents(students.map(s => {
      if (s.id === studentId) {
        return {
          ...s,
          requirements: [...s.requirements, {
            id: crypto.randomUUID(),
            subjectId: '',
            curriculumId: '',
            gradeId: '',
            syllabus: '',
            notes: ''
          }]
        };
      }
      return s;
    }));
  };

  const removeRequirement = (studentId: string, reqId: string) => {
    setStudents(students.map(s => {
      if (s.id === studentId) {
        return { ...s, requirements: s.requirements.filter(r => r.id !== reqId) };
      }
      return s;
    }));
  };

  const updateRequirement = (studentId: string, reqId: string, field: string, value: string) => {
    setStudents(students.map(s => {
      if (s.id === studentId) {
        return {
          ...s,
          requirements: s.requirements.map(r => r.id === reqId ? { ...r, [field]: value } : r)
        };
      }
      return s;
    }));
  };

  // Validation
  const validateStep1 = () => {
    const errs: Record<string, string> = {};
    if (!parent.primaryPhone) errs['parent.primaryPhone'] = 'Primary phone is required';
    if (!parent.source) errs['parent.source'] = 'Source is required';
    
    setValidationErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const validateStep2 = () => {
    const errs: Record<string, string> = {};
    students.forEach((student, sIdx) => {
      if (!student.firstName) errs[`student.${student.id}.firstName`] = 'First name is required';
      
      student.requirements.forEach((req, rIdx) => {
        if (!req.subjectId) errs[`req.${req.id}.subjectId`] = 'Subject is required';
        if (!req.curriculumId) errs[`req.${req.id}.curriculumId`] = 'Curriculum is required';
        if (!req.gradeId) errs[`req.${req.id}.gradeId`] = 'Grade is required';
      });
    });
    setValidationErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleNext = () => {
    if (step === 1 && validateStep1()) setStep(2);
    else if (step === 2 && validateStep2()) setStep(3);
  };

  // Submission
  const handleSubmit = async () => {
    if (!validateStep1() || !validateStep2()) {
      setError("Please fix validation errors before submitting.");
      return;
    }

    setLoading(true);
    setError(null);
    
    // Prepare payload
    const payload = {
      ...parent,
      students: students.map(s => ({
        firstName: s.firstName,
        lastName: s.lastName || undefined,
        dateOfBirth: s.dateOfBirth ? new Date(s.dateOfBirth).toISOString() : undefined,
        gender: s.gender || undefined,
        schoolName: s.schoolName || undefined,
        currentGrade: s.currentGrade || undefined,
        cityLocation: s.cityLocation || undefined,
        notes: s.notes || undefined,
        requirements: s.requirements.map(r => ({
          subjectId: r.subjectId,
          curriculumId: r.curriculumId,
          gradeId: r.gradeId,
          syllabus: r.syllabus || undefined,
          notes: r.notes || undefined
        }))
      }))
    };

    try {
      const res = await createLeadAction(payload);
      
      if (res.error) {
        throw new Error(res.message || 'Validation failed on server');
      }

      if (res.warnings && res.warnings.length > 0) {
        setWarning(res.warnings[0]);
      }
      
      // Store success data to show in Step 4
      setSuccessData(res.lead || res.data?.lead || res.data); // depending on backend envelope
      setStep(4);
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Rendering components
  const renderStep1 = () => (
    <div className="space-y-4 animate-in fade-in">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="text-sm font-medium">First Name</label>
          <Input value={parent.firstName} onChange={e => setParent({...parent, firstName: e.target.value})} placeholder="Parent First Name" />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium">Last Name</label>
          <Input value={parent.lastName} onChange={e => setParent({...parent, lastName: e.target.value})} placeholder="Parent Last Name" />
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="text-sm font-medium">Primary Phone <span className="text-red-500">*</span></label>
          <Input value={parent.primaryPhone} onChange={e => setParent({...parent, primaryPhone: e.target.value})} placeholder="+971..." />
          {validationErrors['parent.primaryPhone'] && <p className="text-xs text-red-500">{validationErrors['parent.primaryPhone']}</p>}
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium">WhatsApp Number</label>
          <Input value={parent.whatsappNumber} onChange={e => setParent({...parent, whatsappNumber: e.target.value})} placeholder="Optional" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="text-sm font-medium">Alternative Phone 1</label>
          <Input value={parent.altPhone1} onChange={e => setParent({...parent, altPhone1: e.target.value})} placeholder="Optional" />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium">Alternative Phone 2</label>
          <Input value={parent.altPhone2} onChange={e => setParent({...parent, altPhone2: e.target.value})} placeholder="Optional" />
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium">Lead Source <span className="text-red-500">*</span></label>
        <Select value={parent.source} onChange={e => setParent({...parent, source: e.target.value})}>
          <option value="META_FACEBOOK">Facebook</option>
          <option value="INSTAGRAM">Instagram</option>
          <option value="GOOGLE">Google</option>
          <option value="WEBSITE">Website</option>
          <option value="REFERRAL">Referral</option>
          <option value="DIRECT">Direct</option>
          <option value="OTHER">Other</option>
        </Select>
      </div>
    </div>
  );

  const renderStep2 = () => (
    <div className="space-y-6 animate-in fade-in max-h-[60vh] overflow-y-auto pr-2">
      {students.length === 0 ? (
        <div className="text-center p-8 border-2 border-dashed border-gray-200 rounded-lg">
          <p className="text-gray-500 mb-4">No students added yet. A lead can have one or more students.</p>
          <Button onClick={addStudent} variant="outline"><Plus className="w-4 h-4 mr-2" /> Add Student</Button>
        </div>
      ) : (
        <div className="space-y-6">
          {students.map((student, sIdx) => (
            <div key={student.id} className="p-4 border rounded-lg bg-gray-50 relative">
              <div className="absolute top-4 right-4">
                <Button variant="ghost" size="sm" onClick={() => removeStudent(student.id)} className="text-red-500 hover:text-red-700 hover:bg-red-50 px-2">
                  <Trash className="w-4 h-4" />
                </Button>
              </div>
              
              <h3 className="font-bold text-md mb-4 flex items-center">
                <div className="w-6 h-6 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-xs mr-2">{sIdx + 1}</div>
                Student Details
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div className="space-y-1">
                  <label className="text-xs font-medium">First Name <span className="text-red-500">*</span></label>
                  <Input value={student.firstName} onChange={e => updateStudent(student.id, 'firstName', e.target.value)} />
                  {validationErrors[`student.${student.id}.firstName`] && <p className="text-xs text-red-500">{validationErrors[`student.${student.id}.firstName`]}</p>}
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium">Last Name</label>
                  <Input value={student.lastName} onChange={e => updateStudent(student.id, 'lastName', e.target.value)} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium">Date of Birth</label>
                  <Input type="date" value={student.dateOfBirth} onChange={e => updateStudent(student.id, 'dateOfBirth', e.target.value)} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium">School / Grade</label>
                  <div className="flex gap-2">
                    <Input placeholder="School" value={student.schoolName} onChange={e => updateStudent(student.id, 'schoolName', e.target.value)} />
                    <Input placeholder="Grade" className="w-24" value={student.currentGrade} onChange={e => updateStudent(student.id, 'currentGrade', e.target.value)} />
                  </div>
                </div>
              </div>

              {/* Requirements Section */}
              <div className="mt-6 pt-4 border-t border-gray-200">
                <h4 className="font-semibold text-sm mb-3 flex items-center justify-between">
                  Requirements
                  <Button type="button" size="sm" variant="outline" onClick={() => addRequirement(student.id)} className="h-7 text-xs px-2">
                    <Plus className="w-3 h-3 mr-1" /> Add Requirement
                  </Button>
                </h4>
                
                {student.requirements.length === 0 ? (
                  <p className="text-xs text-gray-500 italic">No requirements added for this student.</p>
                ) : (
                  <div className="space-y-3">
                    {student.requirements.map((req, rIdx) => (
                      <div key={req.id} className="p-3 bg-white border rounded shadow-sm relative pr-10">
                        <Button type="button" variant="ghost" size="sm" onClick={() => removeRequirement(student.id, req.id)} className="absolute top-2 right-2 h-6 px-2 text-gray-400 hover:text-red-500">
                          <Trash className="w-3 h-3" />
                        </Button>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                          <div className="space-y-1">
                            <label className="text-[10px] uppercase font-bold text-gray-500">Subject <span className="text-red-500">*</span></label>
                            <Select className="text-sm h-8" value={req.subjectId} onChange={e => updateRequirement(student.id, req.id, 'subjectId', e.target.value)}>
                              <option value="">Select...</option>
                              {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </Select>
                            {validationErrors[`req.${req.id}.subjectId`] && <p className="text-[10px] text-red-500">{validationErrors[`req.${req.id}.subjectId`]}</p>}
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] uppercase font-bold text-gray-500">Curriculum <span className="text-red-500">*</span></label>
                            <Select className="text-sm h-8" value={req.curriculumId} onChange={e => updateRequirement(student.id, req.id, 'curriculumId', e.target.value)}>
                              <option value="">Select...</option>
                              {curricula.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </Select>
                            {validationErrors[`req.${req.id}.curriculumId`] && <p className="text-[10px] text-red-500">{validationErrors[`req.${req.id}.curriculumId`]}</p>}
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] uppercase font-bold text-gray-500">Target Grade <span className="text-red-500">*</span></label>
                            <Select className="text-sm h-8" value={req.gradeId} onChange={e => updateRequirement(student.id, req.id, 'gradeId', e.target.value)}>
                              <option value="">Select...</option>
                              {grades.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                            </Select>
                            {validationErrors[`req.${req.id}.gradeId`] && <p className="text-[10px] text-red-500">{validationErrors[`req.${req.id}.gradeId`]}</p>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          <Button type="button" onClick={addStudent} variant="outline" className="w-full border-dashed"><Plus className="w-4 h-4 mr-2" /> Add Another Student</Button>
        </div>
      )}
    </div>
  );

  const renderStep3 = () => (
    <div className="space-y-6 animate-in fade-in max-h-[60vh] overflow-y-auto">
      <div className="bg-gray-50 p-4 rounded-lg border">
        <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">Parent / Lead Details</h3>
        <div className="grid grid-cols-2 gap-y-2 text-sm">
          <div className="text-gray-500">Name</div>
          <div className="font-medium">{parent.firstName} {parent.lastName}</div>
          <div className="text-gray-500">Primary Phone</div>
          <div className="font-medium">{parent.primaryPhone}</div>
          <div className="text-gray-500">Source</div>
          <div className="font-medium">{parent.source}</div>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider">Students & Requirements</h3>
        {students.length === 0 ? (
          <p className="text-sm italic text-gray-500">No students added.</p>
        ) : (
          students.map((student, sIdx) => (
            <div key={student.id} className="border-l-4 border-brand-500 pl-4 py-2">
              <div className="font-bold">{student.firstName} {student.lastName}</div>
              <div className="text-xs text-gray-500 mb-2">{student.schoolName} {student.currentGrade ? `(Grade ${student.currentGrade})` : ''}</div>
              
              {student.requirements.length > 0 ? (
                <ul className="space-y-1 mt-2">
                  {student.requirements.map((req, rIdx) => {
                    const sub = subjects.find(s => s.id === req.subjectId)?.name;
                    const cur = curricula.find(c => c.id === req.curriculumId)?.name;
                    const grd = grades.find(g => g.id === req.gradeId)?.name;
                    return (
                      <li key={req.id} className="text-sm flex items-center before:content-[''] before:w-1 before:h-1 before:bg-gray-400 before:rounded-full before:mr-2">
                        {sub} • {cur} • {grd}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className="text-xs italic text-gray-400 mt-1">No requirements</div>
              )}
            </div>
          ))
        )}
      </div>
      
      {error && <Alert variant="error" className="mt-4">{error}</Alert>}
    </div>
  );

  const renderStep4 = () => {
    if (!successData) return null;
    return (
      <div className="text-center py-8 space-y-4 animate-in zoom-in-95">
        <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
          <Check className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900">Lead Created Successfully</h2>
        <p className="text-gray-500 text-lg font-mono">{successData.businessId}</p>
        
        {warning && (
          <Alert variant="warning" className="text-left mt-4 inline-block max-w-md mx-auto">
            <AlertCircle className="w-4 h-4 mr-2 inline" />
            Duplicate was detected, but Lead was created successfully.
          </Alert>
        )}

        <div className="bg-gray-50 rounded-lg p-4 inline-block text-left mt-6 min-w-[250px]">
          <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
            <span className="text-gray-500">Parent</span>
            <span className="font-medium">{successData.firstName} {successData.lastName}</span>
            
            <span className="text-gray-500">Students</span>
            <span className="font-medium">{students.length}</span>
            
            <span className="text-gray-500">Requirements</span>
            <span className="font-medium">{students.reduce((acc, s) => acc + s.requirements.length, 0)}</span>
            
            <span className="text-gray-500">Owner ID</span>
            <span className="font-medium">{successData.assignedToUserId || 'Unassigned'}</span>
          </div>
        </div>

        <div className="pt-6">
          <Button onClick={() => { onClose(); router.push(`/leads/${successData.id}`); }} className="w-full max-w-xs">
            View Lead
          </Button>
        </div>
      </div>
    );
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} size={step === 4 ? "md" : "xl"}>
      <div className="flex flex-col h-full">
        {step < 4 && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xl font-bold">Create New Lead</h2>
              <div className="text-sm font-medium text-gray-500">Step {step} of 3</div>
            </div>
            <div className="w-full bg-gray-200 h-2 rounded-full overflow-hidden">
              <div className="bg-brand-500 h-full transition-all duration-300" style={{ width: `${(step / 3) * 100}%` }}></div>
            </div>
          </div>
        )}

        <div className="flex-1">
          {step === 1 && renderStep1()}
          {step === 2 && renderStep2()}
          {step === 3 && renderStep3()}
          {step === 4 && renderStep4()}
        </div>

        {step < 4 && (
          <div className="mt-8 pt-4 border-t flex justify-between items-center">
            <Button variant="outline" onClick={step === 1 ? handleClose : () => setStep(step - 1)}>
              {step === 1 ? 'Cancel' : <><ArrowLeft className="w-4 h-4 mr-2" /> Back</>}
            </Button>
            
            {step < 3 ? (
              <Button onClick={handleNext}>
                Next <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            ) : (
              <Button onClick={handleSubmit} disabled={loading} className="bg-green-600 hover:bg-green-700">
                {loading ? 'Creating...' : <><Check className="w-4 h-4 mr-2" /> Submit Lead</>}
              </Button>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
