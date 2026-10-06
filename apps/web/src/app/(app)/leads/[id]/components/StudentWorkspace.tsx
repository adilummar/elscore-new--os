"use client";

import * as React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { usePermissions } from '@/components/providers/AuthProvider';
import { AddEditStudentDialog } from './AddEditStudentDialog';
import { AddEditRequirementDialog } from './AddEditRequirementDialog';
import { GenerateQuotationDialog } from './GenerateQuotationDialog';
import { QuotationHistory } from './QuotationHistory';
import { DeleteStudentDialog } from './DeleteStudentDialog';
import { studentsAfterDeletion } from './student-deletion';

export function StudentWorkspace({ lead, onUpdate }: { lead: any, onUpdate: () => void }) {
  const { hasPermission } = usePermissions();
  const [editingStudent, setEditingStudent] = React.useState<any>(null);
  const [isStudentDialogOpen, setIsStudentDialogOpen] = React.useState(false);
  
  const [editingRequirement, setEditingRequirement] = React.useState<any>(null);
  const [activeStudentIdForReq, setActiveStudentIdForReq] = React.useState<string | null>(null);
  const [isRequirementDialogOpen, setIsRequirementDialogOpen] = React.useState(false);
  const [isQuotationDialogOpen, setIsQuotationDialogOpen] = React.useState(false);
  const [activeStudentForQuotation, setActiveStudentForQuotation] = React.useState<any>(null);
  const [quotationHistoryKey, setQuotationHistoryKey] = React.useState(0);
  const [studentPendingDelete, setStudentPendingDelete] = React.useState<any>(null);
  const [openActionsFor, setOpenActionsFor] = React.useState<string | null>(null);
  const [students, setStudents] = React.useState<any[]>(lead.students ?? []);
  const [notice, setNotice] = React.useState<string | null>(null);

  React.useEffect(() => {
    setStudents(lead.students ?? []);
  }, [lead.students]);

  const openAddStudent = () => {
    setEditingStudent(null);
    setIsStudentDialogOpen(true);
  };

  const openEditStudent = (student: any) => {
    setEditingStudent(student);
    setIsStudentDialogOpen(true);
  };

  const openAddRequirement = (studentId: string) => {
    setEditingRequirement(null);
    setActiveStudentIdForReq(studentId);
    setIsRequirementDialogOpen(true);
  };

  const openEditRequirement = (studentId: string, req: any) => {
    setEditingRequirement(req);
    setActiveStudentIdForReq(studentId);
    setIsRequirementDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold text-slate-900">Students & Requirements</h2>
        <div className="flex gap-2">
          {hasPermission('student.update') && students.length > 0 && (
            <Button onClick={() => openEditStudent(students[0])}>Edit Student Details</Button>
          )}
          {hasPermission('student.create') && (
            <Button variant={students.length > 0 ? 'outline' : 'primary'} onClick={openAddStudent}>
              {students.length > 0 ? '+ Add Another Student' : 'Add Student'}
            </Button>
          )}
        </div>
      </div>

      {notice && <p className="text-sm text-emerald-700" role="status">{notice}</p>}

      {students.length > 0 ? (
        <div className="grid grid-cols-1 gap-6">
          {students.map((student: any) => (
            <Card key={student.id} className="border-slate-200 shadow-sm">
              <CardHeader className="bg-slate-50/50 border-b border-slate-100 pb-4 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-lg">
                    {student.firstName} {student.lastName}
                  </CardTitle>
                  <p className="text-sm text-slate-500 mt-1">
                    {student.schoolName && <span>School: {student.schoolName} | </span>}
                    {student.currentGrade && <span>Grade: {student.currentGrade}</span>}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {hasPermission('student.update') && (
                    <Button variant="outline" size="sm" onClick={() => openEditStudent(student)}>Edit Student</Button>
                  )}
                  {hasPermission('student.delete') && (
                    <div className="relative">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-haspopup="menu"
                        aria-expanded={openActionsFor === student.id}
                        onClick={() => setOpenActionsFor(openActionsFor === student.id ? null : student.id)}
                      >
                        Actions
                      </Button>
                      {openActionsFor === student.id && (
                        <div role="menu" className="absolute right-0 z-10 mt-1 w-44 rounded-md border border-slate-200 bg-white p-1">
                          <button
                            type="button"
                            role="menuitem"
                            className="w-full rounded px-3 py-2 text-left text-sm text-red-700 hover:bg-red-50"
                            onClick={() => {
                              setOpenActionsFor(null);
                              setStudentPendingDelete(student);
                            }}
                          >
                            Delete Student
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent className="pt-4 space-y-4">
                <div className="flex justify-between items-center mb-2">
                  <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider">Subjects</h3>
                  <div className="flex gap-2">
                    {hasPermission('requirement.create') && (
                      <Button variant="outline" size="sm" onClick={() => openAddRequirement(student.id)}>Add Subject</Button>
                    )}
                    {hasPermission('quotation.create') && lead.status === 'DEMO_COMPLETED' && (
                      <Button variant="primary" size="sm" onClick={() => {
                        setActiveStudentForQuotation(student);
                        setIsQuotationDialogOpen(true);
                      }}>Generate Quotation</Button>
                    )}
                  </div>
                </div>
                
                {student.requirements?.length > 0 ? (
                  <div className="space-y-3">
                    {student.requirements.map((req: any) => (
                      <div key={req.id} className="flex justify-between items-center p-3 border border-slate-100 bg-white rounded-md hover:border-brand-200 transition-colors">
                        <div className="flex items-center gap-3">
                          <Badge variant="info" className="bg-brand-50 text-brand-700 hover:bg-brand-100">{req.subject?.name}</Badge>
                          <Badge variant="default">{req.curriculum?.name}</Badge>
                          <Badge variant="default">{req.grade?.name}</Badge>
                          {req.notes && <span className="text-sm text-slate-500 italic ml-2 truncate max-w-xs">{req.notes}</span>}
                        </div>
                        {hasPermission('requirement.update') && (
                          <Button variant="ghost" size="sm" onClick={() => openEditRequirement(student.id, req)}>Edit</Button>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-500 italic">No subjects added yet.</p>
                )}

                <QuotationHistory
                  studentId={student.id}
                  studentName={`${student.firstName} ${student.lastName || ''}`.trim()}
                  refreshKey={quotationHistoryKey}
                />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="border-dashed border-2 border-slate-200 bg-slate-50/50">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-4">
              <span className="text-2xl">🎓</span>
            </div>
            <h3 className="text-lg font-medium text-slate-900 mb-1">No students found</h3>
            <p className="text-sm text-slate-500 mb-4 text-center max-w-md">
              Add a student to track their specific subjects, demos, and enrollments.
            </p>
            {hasPermission('student.create') && (
              <Button onClick={openAddStudent}>Add Student</Button>
            )}
          </CardContent>
        </Card>
      )}

      {studentPendingDelete && (
        <DeleteStudentDialog
          student={studentPendingDelete}
          lead={lead}
          isOpen={!!studentPendingDelete}
          onClose={() => setStudentPendingDelete(null)}
          onDeleted={() => {
            setStudents((current) => studentsAfterDeletion(current, studentPendingDelete.id));
            setNotice('Student deleted.');
            onUpdate();
          }}
        />
      )}

      {isStudentDialogOpen && (
        <AddEditStudentDialog 
          leadId={lead.id} 
          student={editingStudent} 
          isOpen={isStudentDialogOpen} 
          onClose={() => setIsStudentDialogOpen(false)} 
          onSuccess={onUpdate} 
        />
      )}

      {isQuotationDialogOpen && activeStudentForQuotation && (
        <GenerateQuotationDialog
          student={activeStudentForQuotation}
          lead={lead}
          isOpen={isQuotationDialogOpen}
          onClose={() => setIsQuotationDialogOpen(false)}
          onAddRequirement={() => openAddRequirement(activeStudentForQuotation.id)}
          onEditRequirement={(req) => openEditRequirement(activeStudentForQuotation.id, req)}
          onSuccess={() => {
            setIsQuotationDialogOpen(false);
            setQuotationHistoryKey((key) => key + 1);
            onUpdate();
          }}
        />
      )}

      {isRequirementDialogOpen && activeStudentIdForReq && (
        <AddEditRequirementDialog 
          student={students.find((s: any) => s.id === activeStudentIdForReq)} 
          requirement={editingRequirement} 
          isOpen={isRequirementDialogOpen} 
          onClose={() => setIsRequirementDialogOpen(false)} 
          onSuccess={onUpdate} 
        />
      )}
    </div>
  );
}
