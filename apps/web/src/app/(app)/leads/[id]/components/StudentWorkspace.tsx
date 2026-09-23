"use client";

import * as React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { usePermissions } from '@/components/providers/AuthProvider';
import { AddEditStudentDialog } from './AddEditStudentDialog';
import { AddEditRequirementDialog } from './AddEditRequirementDialog';

export function StudentWorkspace({ lead, onUpdate }: { lead: any, onUpdate: () => void }) {
  const { hasPermission } = usePermissions();
  const [editingStudent, setEditingStudent] = React.useState<any>(null);
  const [isStudentDialogOpen, setIsStudentDialogOpen] = React.useState(false);
  
  const [editingRequirement, setEditingRequirement] = React.useState<any>(null);
  const [activeStudentIdForReq, setActiveStudentIdForReq] = React.useState<string | null>(null);
  const [isRequirementDialogOpen, setIsRequirementDialogOpen] = React.useState(false);

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
          {hasPermission('student.update') && lead.students?.length > 0 && (
            <Button onClick={() => openEditStudent(lead.students[0])}>Edit Student Details</Button>
          )}
          {hasPermission('student.create') && (
            <Button variant={lead.students?.length > 0 ? 'outline' : 'primary'} onClick={openAddStudent}>
              {lead.students?.length > 0 ? '+ Add Another Student' : 'Add Student'}
            </Button>
          )}
        </div>
      </div>

      {lead.students?.length > 0 ? (
        <div className="grid grid-cols-1 gap-6">
          {lead.students.map((student: any) => (
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
                {hasPermission('student.update') && (
                  <Button variant="outline" size="sm" onClick={() => openEditStudent(student)}>Edit Student</Button>
                )}
              </CardHeader>
              <CardContent className="pt-4 space-y-4">
                <div className="flex justify-between items-center mb-2">
                  <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider">Subjects</h3>
                  {hasPermission('requirement.create') && (
                    <Button variant="outline" size="sm" onClick={() => openAddRequirement(student.id)}>Add Subject</Button>
                  )}
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

      {isStudentDialogOpen && (
        <AddEditStudentDialog 
          leadId={lead.id} 
          student={editingStudent} 
          isOpen={isStudentDialogOpen} 
          onClose={() => setIsStudentDialogOpen(false)} 
          onSuccess={onUpdate} 
        />
      )}

      {isRequirementDialogOpen && activeStudentIdForReq && (
        <AddEditRequirementDialog 
          student={lead.students.find((s: any) => s.id === activeStudentIdForReq)} 
          requirement={editingRequirement} 
          isOpen={isRequirementDialogOpen} 
          onClose={() => setIsRequirementDialogOpen(false)} 
          onSuccess={onUpdate} 
        />
      )}
    </div>
  );
}
