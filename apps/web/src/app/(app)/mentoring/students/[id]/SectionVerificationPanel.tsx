"use client";

import * as React from 'react';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { SectionView, sectionsOf, verifiedCount, verifiedLine } from '../../section-verification-view';

/**
 * The four verification sections of the activation. Each has one action and two states, Not Verified and Verified. The fields inside a
 * section carry no ticks of their own. If information in a verified section changes, the API returns that section to Not Verified, and
 * the page shows it as it is sent.
 */
export function SectionVerificationPanel({ handover, canEdit, onVerify }: { handover: unknown; canEdit: boolean; onVerify: (sectionId: string, verified: boolean) => Promise<void> }) {
  const sections = sectionsOf(handover);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  if (sections.length === 0) return null;

  const run = async (s: SectionView, verified: boolean) => {
    setBusy(s.sectionId);
    setError(null);
    try {
      await onVerify(s.sectionId, verified);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'The verification could not be saved. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <section aria-label="Section verification" className="mt-3 rounded-md border border-slate-200 p-3" data-testid="section-verification">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">Verification</h3>
        <span className="text-xs text-slate-600" data-testid="section-verified-count">{verifiedCount(sections)} of {sections.length} sections verified</span>
      </div>
      <ul role="list" className="mt-2 grid gap-2 sm:grid-cols-2">
        {sections.map((s) => {
          const verified = s.status === 'VERIFIED';
          return (
            <li key={s.sectionId} className="rounded-md bg-slate-50 p-3" data-section={s.sectionId} data-status={s.status.toLowerCase()}>
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium text-slate-900">{s.label}</p>
                {verified ? (
                  <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium text-emerald-700"><Check aria-hidden className="h-3.5 w-3.5" />Verified</span>
                ) : (
                  <span className="whitespace-nowrap text-xs font-medium text-slate-600">Not Verified</span>
                )}
              </div>
              <p className="mt-1 text-xs text-slate-600">{s.covers}</p>
              {verifiedLine(s) && <p className="mt-1 text-xs text-emerald-700">{verifiedLine(s)}</p>}
              {canEdit && (
                <div className="mt-2">
                  {verified ? (
                    <Button type="button" size="sm" variant="ghost" isLoading={busy === s.sectionId} disabled={busy !== null} onClick={() => run(s, false)} aria-label={`Withdraw verification: ${s.label}`}>Withdraw verification</Button>
                  ) : (
                    <Button type="button" size="sm" isLoading={busy === s.sectionId} disabled={busy !== null} onClick={() => run(s, true)} aria-label={`Verify section: ${s.label}`}>Verify section</Button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {error && <p role="alert" className="mt-2 text-xs font-medium text-red-600">{error}</p>}
    </section>
  );
}
