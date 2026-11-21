import * as React from 'react';

/**
 * The Mentoring visual system. One place for the type scale, surfaces, status chips, tables, tabs and links, so every Mentoring screen
 * reads the same. It uses the app's own tokens (slate neutrals, brand green for actions, the teal sidebar) and adds no dependency.
 *
 * Rules: one border weight (a soft ring, not a box around every block); status is a dot plus words, never colour alone; text is at least
 * 14px except column headings and hints (12px, high contrast); actions are brand green, everything else is neutral; tables use whitespace
 * and a faint rule between rows, not a grid.
 */

export type ChipTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2';

/** A surface: white, one soft ring, a whisper of shadow. Used for tables and the few blocks that need to stand apart. */
export const PANEL = 'rounded-lg bg-white shadow-card ring-1 ring-slate-200/70';
export const TABLE_WRAP = `${PANEL} relative overflow-x-auto`;
export const TABLE = 'min-w-full text-left text-sm';
export const THEAD = 'bg-slate-50/80 text-slate-600';
export const TH = 'px-3 py-2.5 text-xs font-semibold uppercase tracking-wide';
export const TD = 'px-3 py-3 align-top';
export const TR = 'border-t border-slate-100 transition-colors hover:bg-slate-50/70';
export const FIELD_LABEL = 'mb-1 block text-sm font-medium text-slate-700';

const CHIP: Record<ChipTone, string> = {
  neutral: 'bg-slate-100 text-slate-800',
  info: 'bg-sky-50 text-sky-900',
  success: 'bg-emerald-50 text-emerald-900',
  warning: 'bg-amber-50 text-amber-900',
  danger: 'bg-red-50 text-red-900',
};
const DOT: Record<ChipTone, string> = { neutral: 'bg-slate-500', info: 'bg-sky-600', success: 'bg-emerald-600', warning: 'bg-amber-600', danger: 'bg-red-600' };

/** Maps the tone words the existing screens already use onto chip tones. */
export const chipTone = (v: string | undefined): ChipTone => (v === 'success' ? 'success' : v === 'warning' ? 'warning' : v === 'danger' ? 'danger' : v === 'info' ? 'info' : 'neutral');

/** A status: a dot and its words. */
export function StatusChip({ tone = 'neutral', children, className = '' }: { tone?: ChipTone; children: React.ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${CHIP[tone]} ${className}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${DOT[tone]}`} aria-hidden="true" />
      {children}
    </span>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
        {subtitle ? <p className="mt-1 max-w-3xl text-sm leading-relaxed text-slate-600">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

/** Queue tabs: a quiet underline row with a count beside each name. The open one is bold with a green rule. */
export function QueueTabs({ label, items, value, onChange }: { label: string; items: ReadonlyArray<{ key: string; label: string; count?: number; urgent?: boolean }>; value: string; onChange: (key: string) => void }) {
  return (
    <div className="-mx-1 overflow-x-auto px-1">
      <div role="group" aria-label={label} className="flex min-w-max gap-1 border-b border-slate-200">
        {items.map((i) => {
          const on = i.key === value;
          return (
            <button key={i.key} type="button" aria-pressed={on} onClick={() => onChange(i.key)}
              className={`-mb-px inline-flex min-h-11 items-center gap-2 border-b-2 px-3 text-sm ${FOCUS} ${on ? 'border-brand-600 font-semibold text-slate-900' : 'border-transparent font-medium text-slate-600 hover:text-slate-900'}`}>
              {i.label}
              {i.count !== undefined && <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${i.urgent && i.count > 0 ? 'bg-amber-100 text-amber-900' : 'bg-slate-100 text-slate-700'}`}>{i.count}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Two or three choices in one control (Day and Week). */
export function Segmented({ label, items, value, onChange }: { label: string; items: ReadonlyArray<{ key: string; label: string }>; value: string; onChange: (key: string) => void }) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-md bg-slate-100 p-0.5">
      {items.map((i) => (
        <button key={i.key} type="button" aria-pressed={value === i.key} onClick={() => onChange(i.key)}
          className={`min-h-9 rounded px-3 text-sm ${FOCUS} ${value === i.key ? 'bg-white font-semibold text-slate-900 shadow-sm' : 'font-medium text-slate-600 hover:text-slate-900'}`}>{i.label}</button>
      ))}
    </div>
  );
}

export function ProgressBar({ percent, label, tone = 'brand' }: { percent: number; label: string; tone?: 'brand' | 'amber' }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.max(0, Math.min(100, percent))} aria-label={label}>
      <div className={`h-full rounded-full ${tone === 'amber' ? 'bg-amber-600' : 'bg-brand-600'}`} style={{ width: `${Math.max(0, Math.min(100, percent))}%` }} />
    </div>
  );
}

/** A link that looks like a button. Primary is the one green action of a row or page. */
export function linkButton(kind: 'primary' | 'secondary' = 'secondary', block = false): string {
  const base = `inline-flex min-h-9 items-center justify-center rounded-md px-3.5 text-sm font-medium transition-colors ${FOCUS} ${block ? 'w-full min-h-11' : ''}`;
  return kind === 'primary' ? `${base} bg-brand-600 text-white hover:bg-brand-700` : `${base} bg-white text-slate-800 ring-1 ring-inset ring-slate-300 hover:bg-slate-50`;
}

export function Notice({ tone, children, role }: { tone: 'error' | 'info' | 'warning'; children: React.ReactNode; role?: 'alert' | 'status' | 'note' }) {
  const cls = tone === 'error' ? 'bg-red-50 text-red-900' : tone === 'warning' ? 'bg-amber-50 text-amber-900' : 'bg-slate-100 text-slate-800';
  return <p role={role ?? (tone === 'error' ? 'alert' : 'note')} className={`rounded-md px-3 py-2 text-sm ${cls}`}>{children}</p>;
}

/** Rows of grey bars while a list loads, so the page does not jump. */
export function ListSkeleton({ rows = 4, label }: { rows?: number; label: string }) {
  return (
    <div role="status" aria-label={label} className="space-y-2">
      {Array.from({ length: rows }, (_, i) => <div key={i} className="h-14 motion-safe:animate-pulse rounded-md bg-slate-100" />)}
    </div>
  );
}

/** Nothing to show, said plainly with what to do next. */
export function Empty({ title, children, testId }: { title: string; children?: React.ReactNode; testId?: string }) {
  return (
    <div className={`${PANEL} px-6 py-10 text-center`} data-testid={testId}>
      <p className="text-base font-semibold text-slate-900">{title}</p>
      {children ? <p className="mx-auto mt-1 max-w-md text-sm text-slate-600">{children}</p> : null}
    </div>
  );
}

/** Secondary text. slate-600 on white is 7.6:1; slate-400 and slate-500 are not used for text in Mentoring. */
export const MUTED = 'text-slate-600';
export const SUBTLE_ICON = 'text-slate-500';

/** Respects reduced motion: the pulse and the slide only run when the person has not asked for less movement. */
export const PULSE = 'motion-safe:animate-pulse';
export const SPIN = 'motion-safe:animate-spin';

/** A success or failure line that is announced to screen readers. */
export function Banner({ tone, children, onRetry }: { tone: 'error' | 'success' | 'warning' | 'info'; children: React.ReactNode; onRetry?: () => void }) {
  const cls = { error: 'bg-red-50 text-red-900', success: 'bg-emerald-50 text-emerald-900', warning: 'bg-amber-50 text-amber-900', info: 'bg-slate-100 text-slate-800' }[tone];
  return (
    <p role={tone === 'error' ? 'alert' : 'status'} className={`rounded-md px-3 py-2 text-sm ${cls}`}>
      {children}
      {onRetry ? <> <button type="button" onClick={onRetry} className={`rounded font-semibold underline ${FOCUS}`}>Try again</button></> : null}
    </p>
  );
}

/** One count with its meaning. Amber only when something waits on a person. */
export function StatTile({ value, label, hint, attention, onClick, href, testId }: { value: React.ReactNode; label: string; hint?: string; attention?: boolean; onClick?: () => void; href?: string; testId?: string }) {
  const body = (
    <>
      <span className={`block text-2xl font-semibold leading-none ${attention ? 'text-amber-800' : 'text-slate-900'}`}>{value}</span>
      <span className="mt-1.5 block text-sm text-slate-700">{label}</span>
      {hint ? <span className={`mt-0.5 block text-xs ${MUTED}`}>{hint}</span> : null}
    </>
  );
  const cls = `${PANEL} block min-h-16 w-full px-4 py-3 text-left transition-shadow hover:shadow-floating ${FOCUS}`;
  if (href) return <a href={href} className={cls} data-testid={testId}>{body}</a>;
  if (onClick) return <button type="button" onClick={onClick} className={cls} data-testid={testId}>{body}</button>;
  return <div className={`${PANEL} px-4 py-3`} data-testid={testId}>{body}</div>;
}

/** A titled block of a page. The heading is a real heading, so the page has an outline a screen reader can jump through. */
export function Section({ title, aside, children, className = '' }: { title: string; aside?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section aria-label={title} className={`space-y-3 ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        {aside ? <div className={`text-sm ${MUTED}`}>{aside}</div> : null}
      </div>
      {children}
    </section>
  );
}

const FOCUSABLE = 'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * The one overlay for Mentoring: a panel that slides in from the right on wide screens and fills the screen on a phone, or a centred
 * dialog. It is a real dialog: labelled by its title, closes on Escape and on the backdrop, keeps Tab inside, puts focus on the panel when
 * it opens and returns it to the control that opened it, and stops the page behind it from scrolling. The slide is off for people who
 * ask for reduced motion.
 */
export function Overlay({ title, subtitle, onClose, children, variant = 'drawer', size = 'lg', testId, closeLabel = 'Close', headerExtra }: {
  title: string; subtitle?: React.ReactNode; onClose: () => void; children: React.ReactNode; variant?: 'drawer' | 'dialog'; size?: 'md' | 'lg' | 'xl'; testId?: string; closeLabel?: string; headerExtra?: React.ReactNode;
}) {
  const panel = React.useRef<HTMLDivElement>(null);
  const titleId = React.useId();
  const closeRef = React.useRef(onClose);
  closeRef.current = onClose;

  React.useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current?.focus();
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') { ev.stopPropagation(); closeRef.current(); return; }
      if (ev.key !== 'Tab' || !panel.current) return;
      const nodes = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((n) => n.offsetParent !== null || n === document.activeElement);
      if (nodes.length === 0) { ev.preventDefault(); return; }
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement;
      if (ev.shiftKey && (active === first || active === panel.current)) { ev.preventDefault(); last.focus(); }
      else if (!ev.shiftKey && active === last) { ev.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = previous;
      if (opener && document.contains(opener)) opener.focus();
    };
  }, []);

  const width = { md: 'max-w-xl', lg: 'max-w-2xl lg:max-w-3xl', xl: 'max-w-5xl' }[size];
  const drawer = variant === 'drawer';
  return (
    <div className={`fixed inset-0 z-50 flex ${drawer ? 'justify-end' : 'items-center justify-center p-3 sm:p-6'}`} data-testid={testId ? `${testId}-backdrop` : undefined}>
      <div className="absolute inset-0 bg-slate-900/50" onClick={() => closeRef.current()} aria-hidden="true" />
      <div ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} data-testid={testId}
        className={`relative flex w-full flex-col bg-white shadow-modal outline-none ${drawer ? `h-full ${width} motion-safe:animate-overlay-in` : `max-h-[90vh] ${width} rounded-xl motion-safe:animate-overlay-fade`}`}>
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-4 py-4 sm:px-6">
          <div className="min-w-0">
            {headerExtra}
            <h2 id={titleId} className="break-words text-lg font-semibold text-slate-900">{title}</h2>
            {subtitle ? <div className={`mt-1 text-sm ${MUTED}`}>{subtitle}</div> : null}
          </div>
          <button type="button" onClick={() => closeRef.current()} aria-label={closeLabel}
            className={`-mr-2 -mt-1 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900 ${FOCUS}`}>
            <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15" /></svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">{children}</div>
      </div>
    </div>
  );
}

/** A status chip that takes the tone words the older class screens already pass (default, success, warning, danger, info). */
export function ToneBadge({ variant, children, ...rest }: { variant?: string; children: React.ReactNode; 'data-testid'?: string }) {
  return <span {...rest}><StatusChip tone={chipTone(variant)}>{children}</StatusChip></span>;
}
