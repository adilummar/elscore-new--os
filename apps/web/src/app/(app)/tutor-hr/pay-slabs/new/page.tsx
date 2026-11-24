"use client";

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { usePermissions } from '@/components/providers/AuthProvider';
import { ErrorNote, Field, NoAccess, textareaClass } from '../../hiring/_components/kit';
import { RateGrid } from '../_components/RateGrid';
import { createPaySlab } from '../actions';
import { CURRENCIES, createSlabBody, parseBands, saveBlocker, slabAccess } from '../constants';

const EXAMPLE = 'KG-8 = 130, 9-10 = 150, +1/+2 = 170';

export default function NewPaySlabPage() {
  const router = useRouter();
  const { hasPermission } = usePermissions();
  const { canCreate } = slabAccess(hasPermission);
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState<string>('INR');
  const [text, setText] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = useMemo(() => parseBands(text), [text]);
  const blocker = saveBlocker({ name, parsed, confirmed });

  if (!canCreate) return <NoAccess what="creating Pay Slabs" />;

  // Any change to the rates un-ticks the confirmation: what was confirmed must be what is saved.
  const editRates = (v: string) => { setText(v); setConfirmed(false); };
  const editCurrency = (v: string) => { setCurrency(v); setConfirmed(false); };
  const editName = (v: string) => { setName(v); setConfirmed(false); setError(null); };

  const save = async () => {
    if (blocker) return;
    setBusy(true); setError(null);
    const r = await createPaySlab(createSlabBody({ name, currency, parsed }));
    setBusy(false);
    if (r.ok) router.push(`/tutor-hr/pay-slabs/${r.data.id}`);
    else setError(r.message);
  };

  return (
    <form className="space-y-5 max-w-4xl" onSubmit={(e) => { e.preventDefault(); save(); }}>
      <div className="flex items-start gap-3">
        <Link href="/tutor-hr/pay-slabs" aria-label="Back to Pay Slabs" className="mt-1.5 text-slate-500 hover:text-slate-900"><ArrowLeft className="w-5 h-5" /></Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Create pay slab</h1>
          <p className="text-sm text-slate-500 mt-1">Set the hourly rate for every grade from KG to Grade 12.</p>
        </div>
      </div>

      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <Field label="Slab name" required hint="For example French or Mathematics Senior. Names are not case-sensitive.">
                <Input maxLength={80} value={name} onChange={(e) => editName(e.target.value)} />
              </Field>
            </div>
            <Field label="Currency" required>
              <Select value={currency} onChange={(e) => editCurrency(e.target.value)}>
                {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
            </Field>
          </div>

          <Field
            label="Rates per hour"
            required
            hint={`Type bands, separated by commas. Example: ${EXAMPLE}. Use KG, 1 to 10, +1 (Grade 11) and +2 (Grade 12).`}
          >
            <textarea
              rows={3}
              className={textareaClass}
              value={text}
              placeholder={EXAMPLE}
              spellCheck={false}
              aria-describedby="band-problems"
              onChange={(e) => editRates(e.target.value)}
            />
          </Field>
          <div id="band-problems" aria-live="polite" className="space-y-1">
            {parsed.errors.map((m) => <p key={m} className="text-xs text-red-600">{m}</p>)}
            {text.trim() && parsed.errors.length === 0 && parsed.missing.length > 0 && (
              <p className="text-xs text-red-600">No rate yet for: {parsed.missing.join(', ')}</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Check the 13 rates</CardTitle>
          <p className="text-xs text-slate-500">This is exactly what will be saved. It updates as you type.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <RateGrid rates={parsed.rates} currency={currency} label="Rates that will be saved" />
          <div role="note" className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <strong>A slab can never be edited or deleted.</strong> If a rate is wrong later, a new slab has to be created.
          </div>
          <label className="flex items-start gap-2 text-sm text-slate-800">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-slate-300"
              checked={confirmed}
              disabled={!parsed.complete}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            <span>I have checked all 13 rates and the currency. I understand this slab cannot be edited or deleted.</span>
          </label>
        </CardContent>
      </Card>

      <ErrorNote message={error} />
      <div className="flex items-center justify-end gap-3">
        {blocker && <span className="text-xs text-slate-500">{blocker}</span>}
        <Link href="/tutor-hr/pay-slabs"><Button type="button" variant="outline">Cancel</Button></Link>
        <Button type="submit" isLoading={busy} disabled={!!blocker}>Create slab</Button>
      </div>
    </form>
  );
}
