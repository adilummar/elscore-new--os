'use client';

import * as React from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { getWhatsAppPreview, recordWhatsAppOutreach } from '../actions';
import {
  Share2,
  AlertCircle,
  CheckCircle2,
  Copy,
  Check,
  ExternalLink,
  Calendar,
  Clock,
  User,
  BookOpen,
  Info,
  Link as LinkIcon,
  Phone,
} from 'lucide-react';

interface WhatsAppPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  demo: any;
  onSuccess?: () => void;
}

export function WhatsAppPreviewModal({
  isOpen,
  onClose,
  demo,
  onSuccess,
}: WhatsAppPreviewModalProps) {
  const [isLoading, setIsLoading] = React.useState(false);
  const [isSending, setIsSending] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [previewData, setPreviewData] = React.useState<any>(null);

  const demoId = demo?.booking?.id || demo?.id;

  const fetchPreview = React.useCallback(async () => {
    if (!demoId) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await getWhatsAppPreview(demoId);
      if (res.success && res.data) {
        setPreviewData(res.data);
      } else {
        setError(res.error || 'Failed to generate WhatsApp outreach preview');
      }
    } catch (err: any) {
      setError(err.message || 'Error loading WhatsApp preview');
    } finally {
      setIsLoading(false);
    }
  }, [demoId]);

  React.useEffect(() => {
    if (isOpen && demoId) {
      fetchPreview();
      setCopied(false);
    } else {
      setPreviewData(null);
      setError(null);
    }
  }, [isOpen, demoId, fetchPreview]);

  const handleCopy = async () => {
    if (!previewData?.message) return;
    try {
      await navigator.clipboard.writeText(previewData.message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const textarea = document.createElement('textarea');
      textarea.value = previewData.message;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleOpenWhatsApp = async () => {
    if (!previewData?.waUrl || !previewData?.isValidPhone) return;
    setIsSending(true);
    try {
      await recordWhatsAppOutreach(demoId);
      window.open(previewData.waUrl, '_blank');
      if (onSuccess) onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to record WhatsApp outreach activity');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg">
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <Share2 className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-slate-900">
              WhatsApp Outreach Preview
            </h3>
            <p className="text-xs text-slate-500">
              Review authoritative message template and verified contact details before launching WhatsApp
            </p>
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-start gap-2 text-rose-700 text-sm">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <div className="flex-1">
              <span>{error}</span>
              <button
                onClick={fetchPreview}
                className="block text-xs font-semibold underline mt-1 text-rose-800 hover:text-rose-950"
              >
                Try Again
              </button>
            </div>
          </div>
        )}

        {/* Loading state */}
        {isLoading && (
          <div className="py-12 text-center space-y-3">
            <div className="w-8 h-8 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-sm text-slate-500">Loading dynamic template & contact data...</p>
          </div>
        )}

        {/* Loaded preview */}
        {!isLoading && previewData && (
          <div className="space-y-4">
            {/* Metadata Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Recipient Details */}
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-1.5 text-xs">
                <div className="flex items-center gap-1.5 text-slate-700 font-semibold uppercase tracking-wider text-[10px]">
                  <User className="w-3.5 h-3.5 text-slate-500" />
                  <span>Student & Parent</span>
                </div>
                <div className="text-slate-900 font-medium">
                  {previewData.studentName}
                </div>
                <div className="text-slate-500">
                  Parent:{' '}
                  <span className="text-slate-700">
                    {previewData.parentName || 'Not recorded (fallback greeting: "Hello sir,")'}
                  </span>
                </div>
              </div>

              {/* Phone Validation Card */}
              <div
                className={`p-3 rounded-lg border space-y-1.5 text-xs ${
                  previewData.isValidPhone
                    ? 'bg-emerald-50/50 border-emerald-200'
                    : 'bg-rose-50/50 border-rose-200'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-slate-700 font-semibold uppercase tracking-wider text-[10px]">
                    <Phone className="w-3.5 h-3.5 text-slate-500" />
                    <span>WhatsApp Contact</span>
                  </div>
                  {previewData.isValidPhone ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">
                      <CheckCircle2 className="w-3 h-3" /> Valid
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-rose-700 bg-rose-100 px-1.5 py-0.5 rounded">
                      <AlertCircle className="w-3 h-3" /> Invalid
                    </span>
                  )}
                </div>
                <div className="font-mono text-slate-900 font-medium">
                  {previewData.phone ? `+${previewData.phone}` : 'None provided'}
                </div>
                {!previewData.isValidPhone && (
                  <p className="text-[11px] text-rose-600 font-medium">
                    {previewData.phoneError || 'Minimum 10 digits required for WhatsApp outreach.'}
                  </p>
                )}
              </div>
            </div>

            {/* Session & Schedule Info */}
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-slate-700">
                  <Calendar className="w-3.5 h-3.5 text-slate-500" />
                  <span className="font-medium">
                    {previewData.scheduledDate
                      ? new Intl.DateTimeFormat('en-IN', {
                          timeZone: 'Asia/Kolkata',
                          weekday: 'short',
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                          hour12: true,
                        }).format(new Date(previewData.scheduledDate)) + ' IST'
                      : 'Scheduled Date'}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-slate-600">
                  <span className="text-[11px] text-slate-400">Coordinator:</span>
                  <span className="font-medium text-slate-800">{previewData.coordinatorName}</span>
                </div>
              </div>

              {previewData.sessions && previewData.sessions.length > 0 && (
                <div className="pt-2 border-t border-slate-200/70 space-y-1">
                  <div className="flex items-center gap-1.5 text-slate-500 text-[11px]">
                    <BookOpen className="w-3 h-3" />
                    <span>Subjects & Tutors:</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {previewData.sessions.map((s: any, idx: number) => (
                      <span
                        key={idx}
                        className="inline-flex items-center gap-1 bg-white border border-slate-200 px-2 py-0.5 rounded text-[11px] text-slate-700"
                      >
                        <span className="font-medium">{s.subjectName}</span>
                        <span className="text-slate-400">→</span>
                        <span className="text-slate-600">{s.tutorName || 'To be assigned'}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {previewData.meetingLink && (
                <div className="pt-1.5 flex items-center gap-1.5 text-[11px] text-indigo-700 font-mono truncate">
                  <LinkIcon className="w-3 h-3 shrink-0" />
                  <span className="truncate">{previewData.meetingLink}</span>
                </div>
              )}
            </div>

            {/* Message Preview Box */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-700 uppercase tracking-wider text-[10px]">
                  Authoritative Message Template
                </span>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="inline-flex items-center gap-1 text-[11px] text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-2 py-1 rounded transition-colors"
                >
                  {copied ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-600" />
                      <span className="text-emerald-700 font-medium">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>Copy Text</span>
                    </>
                  )}
                </button>
              </div>

              <div className="relative rounded-lg border border-emerald-200 bg-emerald-50/30 p-4">
                <pre className="font-mono text-xs text-slate-800 whitespace-pre-wrap leading-relaxed select-text">
                  {previewData.message}
                </pre>
              </div>
            </div>

            {/* Procedural Notice */}
            <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-lg flex items-start gap-2 text-amber-900 text-xs">
              <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="leading-relaxed">
                <span className="font-semibold">Workflow Rule:</span> Opening WhatsApp records outreach in audit logs, but does <span className="font-semibold underline">not</span> confirm the demo. Parent confirmation must be recorded separately once attendance is acknowledged.
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-100">
          <Button type="button" variant="outline" onClick={onClose} disabled={isSending}>
            Cancel
          </Button>

          <Button
            type="button"
            disabled={isLoading || isSending || !previewData?.isValidPhone || !previewData?.waUrl}
            onClick={handleOpenWhatsApp}
            className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 shadow-sm disabled:opacity-50"
          >
            <ExternalLink className="w-4 h-4" />
            <span>{isSending ? 'Launching WhatsApp...' : 'Open WhatsApp Web / App'}</span>
          </Button>
        </div>
      </div>
    </Modal>
  );
}
