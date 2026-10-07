"use client";

import * as React from 'react';
import { AlertTriangle } from 'lucide-react';

import { usePermissions } from '@/components/providers/AuthProvider';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { fmtDateTime, fmtTime } from '@/lib/time';

import {
  approveMissedCheckoutAction,
  getMissedCheckoutCasesAction,
  rejectMissedCheckoutAction,
  resolveMissedCheckoutAction,
} from '../actions';
import { validRejectionReason } from '../missed-checkout';

type ReviewAction = 'approve' | 'reject' | 'resolve';

export default function MissedCheckoutManagementPage() {
  const { hasPermission } = usePermissions();
  const [cases, setCases] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [selected, setSelected] = React.useState<any>(null);
  const [reviewAction, setReviewAction] = React.useState<ReviewAction | null>(null);
  const [rejectionReason, setRejectionReason] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [message, setMessage] = React.useState<{ text: string; error: boolean } | null>(null);
  const cancelRef = React.useRef<HTMLButtonElement>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      setCases(await getMissedCheckoutCasesAction());
    } catch (error) {
      setMessage({
        text: error instanceof Error ? error.message : 'Failed to load missed checkouts',
        error: true,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (hasPermission('attendance.missed-checkout.approve')) load();
  }, [hasPermission, load]);

  React.useEffect(() => {
    if (reviewAction) cancelRef.current?.focus();
  }, [reviewAction]);

  const openReview = (missedCase: any, action: ReviewAction) => {
    setSelected(missedCase);
    setReviewAction(action);
    setRejectionReason('');
    setMessage(null);
  };

  const closeReview = () => {
    if (submitting) return;
    setSelected(null);
    setReviewAction(null);
    setRejectionReason('');
  };

  const submitReview = async () => {
    if (!selected || !reviewAction || submitting) return;
    if (reviewAction === 'reject' && !validRejectionReason(rejectionReason)) {
      setMessage({ text: 'A rejection reason is required.', error: true });
      return;
    }

    setSubmitting(true);
    const result = reviewAction === 'approve'
      ? await approveMissedCheckoutAction(selected.id)
      : reviewAction === 'reject'
        ? await rejectMissedCheckoutAction(selected.id, rejectionReason.trim())
        : await resolveMissedCheckoutAction(selected.id);
    setSubmitting(false);

    if (!result.success) {
      setMessage({ text: result.error, error: true });
      return;
    }

    setMessage({
      text: reviewAction === 'approve'
        ? 'Missed checkout approved.'
        : reviewAction === 'reject'
          ? 'Approval request rejected.'
          : 'Missed checkout resolved.',
      error: false,
    });
    closeReview();
    await load();
  };

  if (!hasPermission('attendance.missed-checkout.approve')) {
    return <div className="p-6 text-slate-600">You do not have access to missed checkout management.</div>;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
            <AlertTriangle className="h-6 w-6 text-amber-600" />
            Missed Checkouts
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Review unresolved attendance auto-closures within your management scope.
          </p>
        </div>
        <Badge variant="warning">{cases.length} unresolved</Badge>
      </div>

      {message && (
        <div
          role={message.error ? 'alert' : 'status'}
          className={`rounded-md p-3 text-sm ${message.error ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}
        >
          {message.text}
        </div>
      )}

      {loading ? (
        <p className="py-10 text-center text-slate-500">Loading missed checkouts…</p>
      ) : cases.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-slate-500">
            No unresolved missed checkouts in your scope.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {cases.map((missedCase) => {
            const checkIn = missedCase.session.events.find((event: any) => event.eventType === 'CHECK_IN');
            const autoCheckout = missedCase.session.events.find((event: any) => event.eventType === 'AUTO_CHECK_OUT');
            return (
              <Card key={missedCase.id}>
                <CardHeader className="flex flex-row items-start justify-between gap-4">
                  <div>
                    <CardTitle>
                      {missedCase.employee.firstName} {missedCase.employee.lastName}
                    </CardTitle>
                    <p className="mt-1 text-sm text-slate-500">
                      {missedCase.employee.businessId} · {missedCase.employee.department.name}
                    </p>
                  </div>
                  <Badge variant={missedCase.status === 'REJECTED' ? 'danger' : 'warning'}>
                    {missedCase.status.replace(/_/g, ' ')}
                  </Badge>
                </CardHeader>
                <CardContent>
                  <dl className="grid grid-cols-2 gap-3 text-sm md:grid-cols-5">
                    <div><dt className="text-slate-500">Attendance date</dt><dd className="font-medium">{missedCase.session.calendarDate}</dd></div>
                    <div><dt className="text-slate-500">Check in</dt><dd className="font-medium">{fmtTime(checkIn?.timestamp)}</dd></div>
                    <div><dt className="text-slate-500">Effective auto-checkout</dt><dd className="font-medium">{fmtTime(autoCheckout?.timestamp)}</dd></div>
                    <div><dt className="text-slate-500">Auto-close executed</dt><dd className="font-medium">{fmtDateTime(autoCheckout?.createdAt)}</dd></div>
                    <div><dt className="text-slate-500">Requested</dt><dd className="font-medium">{fmtDateTime(missedCase.requestedAt)}</dd></div>
                  </dl>
                  {missedCase.rejectionReason && (
                    <p className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-700">
                      Previous rejection: {missedCase.rejectionReason}
                    </p>
                  )}
                  <div className="mt-4 flex flex-wrap justify-end gap-2">
                    {missedCase.status === 'REQUESTED' && (
                      <>
                        <Button variant="outline" onClick={() => openReview(missedCase, 'reject')}>Reject</Button>
                        <Button onClick={() => openReview(missedCase, 'approve')}>Approve</Button>
                      </>
                    )}
                    <Button variant="danger" onClick={() => openReview(missedCase, 'resolve')}>
                      Resolve Missed Checkout
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Modal isOpen={Boolean(selected && reviewAction)} onClose={closeReview} size="md">
        <h2 className="text-lg font-bold text-slate-900">
          {reviewAction === 'approve'
            ? 'Approve missed checkout'
            : reviewAction === 'reject'
              ? 'Reject approval request'
              : 'Resolve Missed Checkout'}
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          {selected?.employee.firstName} {selected?.employee.lastName} · {selected?.session.calendarDate}
        </p>
        <p className="mt-3 text-sm text-slate-700">
          {reviewAction === 'resolve'
            ? 'This deliberately clears the future check-in restriction. It does not rewrite the historical auto-closed attendance.'
            : reviewAction === 'approve'
              ? 'Approval clears the future check-in restriction but preserves the historical auto-closed attendance.'
              : 'The employee will remain blocked and may submit another request.'}
        </p>
        {reviewAction === 'reject' && (
          <div className="mt-4">
            <label htmlFor="rejection-reason" className="text-sm font-medium text-slate-900">Rejection reason</label>
            <textarea
              id="rejection-reason"
              value={rejectionReason}
              onChange={(event) => setRejectionReason(event.target.value)}
              maxLength={500}
              rows={3}
              disabled={submitting}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              required
            />
          </div>
        )}
        <div className="mt-5 flex justify-end gap-3">
          <Button ref={cancelRef} variant="outline" onClick={closeReview} disabled={submitting} autoFocus>
            Cancel
          </Button>
          <Button
            variant={reviewAction === 'approve' ? 'primary' : 'danger'}
            onClick={submitReview}
            isLoading={submitting}
            disabled={submitting || (reviewAction === 'reject' && !validRejectionReason(rejectionReason))}
          >
            {reviewAction === 'approve' ? 'Approve' : reviewAction === 'reject' ? 'Reject' : 'Resolve Missed Checkout'}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
