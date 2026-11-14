"use client";

import * as React from 'react';
import { AlertTriangle, Check, Lock } from 'lucide-react';

import { StepId, StepView, stepSummary } from './class-stepper-view';
import { FOCUS } from './mentoring-ui';

const BADGE: Record<StepView['state'], string> = {
  COMPLETE: 'bg-emerald-600 text-white',
  CURRENT: 'bg-brand-600 text-white ring-4 ring-brand-100',
  ATTENTION: 'bg-amber-500 text-white',
  PENDING: 'bg-white text-slate-600 ring-1 ring-inset ring-slate-300',
};

/**
 * The four steps of a class in one compact row: completed, current and not started are told apart by an icon and a word as well as colour. A step
 * that cannot be reached yet is shown but not clickable. Opening a step only shows it; the state comes from what was recorded. It stays one row
 * at phone width, with the labels wrapping under their numbers.
 */
export function ClassStepper({ steps, selected, onSelect }: { steps: StepView[]; selected: StepId; onSelect: (id: StepId) => void }) {
  const refs = React.useRef<Record<string, HTMLButtonElement | null>>({});
  const onKey = (e: React.KeyboardEvent, i: number) => {
    const dir = e.key === 'ArrowLeft' || e.key === 'End' ? -1 : 1;
    const start = e.key === 'Home' ? 0 : e.key === 'End' ? steps.length - 1 : e.key === 'ArrowRight' || e.key === 'ArrowLeft' ? i + dir : null;
    if (start === null) return;
    e.preventDefault();
    // Skip steps that cannot be reached yet.
    for (let n = 0; n < steps.length; n += 1) {
      const step = steps[(((start + n * dir) % steps.length) + steps.length) % steps.length];
      if (step.reachable) { refs.current[step.id]?.focus(); return; }
    }
  };
  return (
    <nav aria-label="Class workflow" className="-mx-1 overflow-x-auto px-1" data-testid="class-stepper">
      <ol className="flex min-w-[20rem] items-start">
        {steps.map((s, i) => {
          const on = s.id === selected;
          return (
            <li key={s.id} className="relative flex flex-1 flex-col items-center" data-step={s.id} data-state={s.state}>
              {i > 0 && <span aria-hidden="true" className={`absolute right-1/2 top-[1.15rem] h-0.5 w-full ${steps[i - 1].state === 'COMPLETE' ? 'bg-emerald-500' : 'bg-slate-200'}`} />}
              <button ref={(el) => { refs.current[s.id] = el; }} type="button" disabled={!s.reachable} aria-current={on ? 'step' : undefined} aria-label={stepSummary(s)}
                onClick={() => onSelect(s.id)} onKeyDown={(e) => onKey(e, i)} title={s.reachable ? undefined : 'Finish the earlier step first'}
                className={`group relative z-10 flex min-h-11 w-full flex-col items-center gap-1 rounded-md px-1 py-1 text-center disabled:cursor-not-allowed ${FOCUS}`}>
                <span className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold ${BADGE[s.state]} ${s.reachable ? '' : 'opacity-60'}`}>
                  {s.state === 'COMPLETE' ? <Check className="h-4 w-4" aria-hidden="true" /> : s.state === 'ATTENTION' ? <AlertTriangle className="h-4 w-4" aria-hidden="true" /> : !s.reachable ? <Lock className="h-3.5 w-3.5" aria-hidden="true" /> : s.number}
                </span>
                <span className={`text-xs leading-tight sm:text-sm ${on ? 'font-semibold text-slate-900' : 'font-medium text-slate-700'}`}>{s.label}</span>
                <span className={`text-[11px] leading-none ${s.state === 'COMPLETE' ? 'text-emerald-800' : s.state === 'ATTENTION' ? 'text-amber-900' : 'text-slate-600'}`}>{s.stateText}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
