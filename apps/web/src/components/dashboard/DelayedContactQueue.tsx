'use client';

import * as React from 'react';
import Link from 'next/link';
import { MessageCircle, PhoneCall } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { assigneeLabel, overdueLabel } from './delayed-contact';
import { getDelayedLeadsAction, type DelayedLeadsResponse } from './actions';

const REFRESH_MS = 60_000;

function leadName(lead: DelayedLeadsResponse['delayedLeads'][number]): string {
  const name = [lead.firstName, lead.lastName].filter(Boolean).join(' ').trim();
  return name || 'Unknown Name';
}

function whatsappDigits(phone: string | null | undefined): string {
  return (phone || '').replace(/\D/g, '');
}

export function DelayedContactQueue({
  initial,
  initialError,
}: {
  initial: DelayedLeadsResponse | null;
  initialError?: string | null;
}) {
  const [data, setData] = React.useState<DelayedLeadsResponse | null>(initial);
  const [error, setError] = React.useState<string | null>(initialError ?? null);
  const [now, setNow] = React.useState(() => new Date());

  const refresh = React.useCallback(async () => {
    try {
      const next = await getDelayedLeadsAction();
      setData(next);
      setError(null);
      setNow(new Date());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Delayed contacts could not be refreshed');
    }
  }, []);

  React.useEffect(() => {
    const timer = window.setInterval(() => {
      void refresh();
    }, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const leads = data?.delayedLeads ?? [];
  const count = data?.delayedCount ?? leads.length;

  return (
    <Card className="border-amber-200">
      <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle>Delayed Contact</CardTitle>
          <p className="text-sm text-slate-500 mt-1">Leads not contacted within 15 minutes</p>
        </div>
        <p className="text-3xl font-bold text-amber-700 tabular-nums">{count}</p>
      </CardHeader>
      <CardContent>
        {error && data ? (
          <p className="mb-3 text-xs text-amber-700">Showing the last loaded queue. Refresh failed.</p>
        ) : null}
        {error && !data ? (
          <div className="p-4 bg-red-50 text-red-600 rounded-md text-sm">{error}</div>
        ) : leads.length === 0 ? (
          <p className="text-sm text-slate-500 py-4">No leads are waiting past the 15-minute contact SLA.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {leads.map((lead) => {
              const digits = whatsappDigits(lead.primaryPhone);
              return (
                <div key={lead.id} className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">{leadName(lead)}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{assigneeLabel(lead.assignedToUser)}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                    <span className="text-sm font-medium text-amber-700">{overdueLabel(lead.createdAt, now)}</span>
                    <Link
                      href={`/leads/${lead.id}`}
                      className="inline-flex h-8 items-center rounded-md border border-slate-300 px-3 text-sm text-slate-700 hover:bg-slate-50"
                    >
                      View
                    </Link>
                    {lead.primaryPhone ? (
                      <a
                        href={`tel:${lead.primaryPhone}`}
                        className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-300 px-3 text-sm text-slate-700 hover:bg-brand-50 hover:text-brand-700"
                        title="Call"
                      >
                        <PhoneCall className="h-3.5 w-3.5" />
                        Call
                      </a>
                    ) : null}
                    {digits ? (
                      <a
                        href={`https://wa.me/${digits}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-300 px-3 text-sm text-slate-700 hover:bg-green-50 hover:text-green-700"
                        title="WhatsApp"
                        aria-label="Open WhatsApp"
                      >
                        <MessageCircle className="h-3.5 w-3.5" />
                        WhatsApp
                      </a>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
