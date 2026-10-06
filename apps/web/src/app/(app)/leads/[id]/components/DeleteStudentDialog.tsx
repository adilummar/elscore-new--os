"use client";

import * as React from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { deleteStudentAction } from '../../actions';
import { deletionErrorView, type StudentDeletionError } from './student-deletion';

export function DeleteStudentDialog({
  student,
  lead,
  isOpen,
  onClose,
  onDeleted,
}: {
  student: any;
  lead: any;
  isOpen: boolean;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const cancelRef = React.useRef<HTMLButtonElement>(null);
  const [reason, setReason] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [blockers, setBlockers] = React.useState<string[]>([]);
  const requirementCount = student?.requirements?.length ?? 0;
  const studentName = `${student?.firstName ?? ''} ${student?.lastName ?? ''}`.trim();
  const leadReference = [lead?.businessId, `${lead?.firstName ?? ''} ${lead?.lastName ?? ''}`.trim()]
    .filter(Boolean)
    .join(' · ');

  React.useEffect(() => {
    if (!isOpen) return;
    setReason('');
    setErrorMessage(null);
    setBlockers([]);
    setLoading(false);
    cancelRef.current?.focus();
  }, [isOpen, student?.id]);

  const handleDelete = async () => {
    if (loading) return;
    const trimmed = reason.trim();
    if (!trimmed) {
      setErrorMessage('A deletion reason is required.');
      setBlockers([]);
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    setBlockers([]);
    try {
      const result = await deleteStudentAction(student.id, trimmed, lead.id);
      if (!result.ok) {
        const view = deletionErrorView({
          name: 'Error',
          message: result.message,
          code: result.code,
          blockers: result.blockers,
        });
        setErrorMessage(view.message);
        setBlockers(view.blockers);
        return;
      }
      onDeleted();
      onClose();
    } catch (error: any) {
      const view = deletionErrorView(error as StudentDeletionError);
      setErrorMessage(view.message);
      setBlockers(view.blockers);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={loading ? () => undefined : onClose} size="md">
      <h2 className="text-lg font-bold text-slate-900 mb-2">Delete unused Student</h2>
      <div className="space-y-3 text-sm text-slate-700">
        <p><span className="font-medium text-slate-900">Student:</span> {studentName}</p>
        <p><span className="font-medium text-slate-900">Business ID:</span> {student?.businessId}</p>
        <p><span className="font-medium text-slate-900">Lead:</span> {leadReference}</p>
        <p>
          <span className="font-medium text-slate-900">Requirements that will also be removed:</span> {requirementCount}
        </p>
        <p>
          This action permanently deletes this Student. Any associated Requirements will also be removed. This action cannot be undone.
        </p>
        <div className="space-y-1">
          <label htmlFor="delete-student-reason" className="text-sm font-medium text-slate-900">Deletion reason</label>
          <textarea
            id="delete-student-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={500}
            rows={3}
            required
            disabled={loading}
            className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
            placeholder="Why is this unused Student being removed?"
          />
        </div>
        {errorMessage && (
          <div className="p-3 bg-red-50 text-red-700 rounded-md" role="alert">
            <p>{errorMessage}</p>
            {blockers.length > 0 && (
              <ul className="mt-2 list-disc pl-5">
                {blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}
              </ul>
            )}
          </div>
        )}
      </div>
      <div className="flex justify-end gap-3 pt-4">
        <Button ref={cancelRef} type="button" variant="outline" onClick={onClose} disabled={loading} autoFocus>
          Cancel
        </Button>
        <Button type="button" variant="danger" onClick={handleDelete} isLoading={loading} disabled={loading || !reason.trim()}>
          Delete Student
        </Button>
      </div>
    </Modal>
  );
}
