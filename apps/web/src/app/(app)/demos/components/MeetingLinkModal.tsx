'use client';

import * as React from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { recordMeetingLink } from '../actions';
import { Link2, AlertCircle, Video, ExternalLink } from 'lucide-react';

interface MeetingLinkModalProps {
  isOpen: boolean;
  onClose: () => void;
  demo: any;
  onSuccess: () => void;
}

export function MeetingLinkModal({ isOpen, onClose, demo, onSuccess }: MeetingLinkModalProps) {
  const [isLoading, setIsLoading] = React.useState(false);
  const [meetingLink, setMeetingLink] = React.useState('');
  const [platform, setPlatform] = React.useState('GOOGLE_MEET');
  const [reason, setReason] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (demo && isOpen) {
      const currentLink = demo.meetingLink || demo.booking?.meetingLink || '';
      setMeetingLink(currentLink);
      if (currentLink.includes('zoom.us')) {
        setPlatform('ZOOM');
      } else if (currentLink.includes('teams.microsoft.com')) {
        setPlatform('TEAMS');
      } else {
        setPlatform('GOOGLE_MEET');
      }
      setReason('');
      setError(null);
    }
  }, [demo, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!meetingLink.trim()) {
      setError('Meeting link is required');
      return;
    }

    try {
      new URL(meetingLink.trim());
    } catch {
      setError('Please enter a valid URL (e.g. https://meet.google.com/abc-defg-hij)');
      return;
    }

    setIsLoading(true);
    setError(null);

    const demoId = demo.booking?.id || demo.id;
    const res = await recordMeetingLink(demoId, {
      meetingLink: meetingLink.trim(),
      meetingPlatform: platform,
      changeReason: reason.trim() || undefined,
    });
    setIsLoading(false);

    if (!res.success) {
      setError(res.error || 'Failed to record meeting link');
    } else {
      onSuccess();
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg">
      <div className="space-y-5">
        <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <Video className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-slate-900">
              Meeting Link & Platform
            </h3>
            <p className="text-xs text-slate-500">
              Record the video meeting link for internal sharing and sales parent outreach
            </p>
          </div>
        </div>

        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-start gap-2 text-rose-700 text-sm">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider block mb-1.5">
              Platform
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'GOOGLE_MEET', label: 'Google Meet' },
                { id: 'ZOOM', label: 'Zoom' },
                { id: 'TEAMS', label: 'MS Teams' },
              ].map((p) => (
                <button
                  type="button"
                  key={p.id}
                  onClick={() => setPlatform(p.id)}
                  className={`p-2.5 text-xs font-medium rounded-lg border text-center transition-all ${
                    platform === p.id
                      ? 'bg-blue-50 border-blue-600 text-blue-700 shadow-sm'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider block mb-1.5">
              Meeting URL
            </label>
            <div className="relative">
              <Input
                type="url"
                required
                value={meetingLink}
                onChange={(e) => setMeetingLink(e.target.value)}
                placeholder="https://meet.google.com/xxx-yyyy-zzz"
                className="pr-10"
              />
              {meetingLink && (
                <a
                  href={meetingLink}
                  target="_blank"
                  rel="noreferrer"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-blue-600"
                  title="Test link in new tab"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Internal meeting links are versioned in the audit history when updated.
            </p>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider block mb-1.5">
              Reason / Remarks (Optional)
            </label>
            <Input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Generated recurring Meet room for coordinator oversight"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
            <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'Saving...' : 'Record Meeting Link'}
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
