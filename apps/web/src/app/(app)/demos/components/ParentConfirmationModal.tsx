'use client';

import * as React from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { confirmParentMeeting } from '../actions';
import { CheckCircle, AlertCircle, MessageCircle, Phone, Mail, MoreHorizontal, Calendar, User, Link as LinkIcon } from 'lucide-react';

interface ParentConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  demo: any;
  onSuccess: () => void;
}

export function ParentConfirmationModal({ isOpen, onClose, demo, onSuccess }: ParentConfirmationModalProps) {
  const [isLoading, setIsLoading] = React.useState(false);
  const [channel, setChannel] = React.useState<'WHATSAPP_CHAT' | 'PHONE_CALL' | 'EMAIL' | 'OTHER'>('WHATSAPP_CHAT');
  const [notes, setNotes] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (demo && isOpen) {
      setChannel('WHATSAPP_CHAT');
      setNotes('');
      setError(null);
    }
  }, [demo, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    const demoId = demo.booking?.id || demo.id;
    const res = await confirmParentMeeting(demoId, {
      confirmationChannel: channel,
      confirmationNotes: notes.trim() || undefined,
    });
    setIsLoading(false);

    if (!res.success) {
      setError(res.error || 'Failed to record parent confirmation');
    } else {
      onSuccess();
    }
  };

  const channels = [
    { id: 'WHATSAPP_CHAT', label: 'WhatsApp Chat', icon: MessageCircle },
    { id: 'PHONE_CALL', label: 'Phone Call', icon: Phone },
    { id: 'EMAIL', label: 'Email', icon: Mail },
    { id: 'OTHER', label: 'Other Channel', icon: MoreHorizontal },
  ] as const;

  const studentName = demo?.student
    ? `${demo.student.firstName} ${demo.student.lastName || ''}`.trim()
    : demo?.studentName || 'Student';
  const parentName = demo?.parentName || demo?.lead?.parentName || demo?.student?.lead?.parentName || null;
  const scheduledTime = demo?.scheduledAt || demo?.booking?.scheduledDate;
  const meetingLink = demo?.meetingLink || demo?.booking?.meetingLink;
  const subjectName = demo?.subject?.name || demo?.booking?.sessions?.[0]?.subject?.name || 'General';

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="md">
      <div className="space-y-5">
        <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <CheckCircle className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-slate-900">
              Confirm Parent Attendance
            </h3>
            <p className="text-xs text-slate-500">
              Record that the parent acknowledged and confirmed attendance for the demo
            </p>
          </div>
        </div>

        {/* Demo Context Summary */}
        <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-slate-900 flex items-center gap-1">
              <User className="w-3.5 h-3.5 text-slate-500" />
              {studentName} {parentName ? `(Parent: ${parentName})` : ''}
            </span>
            <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-medium text-[11px]">
              {subjectName}
            </span>
          </div>
          {scheduledTime && (
            <div className="flex items-center gap-1.5 text-slate-600">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span>
                {new Intl.DateTimeFormat('en-IN', {
                  timeZone: 'Asia/Kolkata',
                  weekday: 'short',
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                  hour12: true,
                }).format(new Date(scheduledTime))} IST
              </span>
            </div>
          )}
          {meetingLink && (
            <div className="flex items-center gap-1.5 text-indigo-700 font-mono text-[11px] truncate">
              <LinkIcon className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
              <span className="truncate">{meetingLink}</span>
            </div>
          )}
        </div>

        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-start gap-2 text-rose-700 text-sm">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider block mb-2">
              Confirmation Channel
            </label>
            <div className="grid grid-cols-2 gap-2">
              {channels.map((c) => {
                const Icon = c.icon;
                const isSelected = channel === c.id;
                return (
                  <button
                    type="button"
                    key={c.id}
                    onClick={() => setChannel(c.id)}
                    className={`p-3 text-xs font-medium rounded-lg border flex items-center gap-2 transition-all ${
                      isSelected
                        ? 'bg-emerald-50 border-emerald-600 text-emerald-700 shadow-sm'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{c.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider block mb-1.5">
              Confirmation Notes (Optional)
            </label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Parent confirmed via WhatsApp, requested meeting reminder 10 minutes prior"
              className="w-full text-sm rounded-lg border border-slate-200 p-3 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent placeholder:text-slate-400"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
            <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              {isLoading ? 'Recording...' : 'Confirm Parent Attendance'}
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
