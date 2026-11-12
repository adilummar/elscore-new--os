"use client";

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { ChevronRight, Eye } from 'lucide-react';
import { usePermissions } from '@/components/providers/AuthProvider';

import { breadcrumbsOf, isCurrent, primaryNav, readOnlyNotice, secondaryNav } from './shell-view';

const CrumbContext = React.createContext<(label: string | undefined) => void>(() => undefined);

/** A page deeper than its section names what is open (the student and subject of a class) for the breadcrumb. */
export function CrumbDetail({ label }: { label: string | undefined }) {
  const set = React.useContext(CrumbContext);
  React.useEffect(() => { set(label); return () => set(undefined); }, [label, set]);
  return null;
}

const RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1';

/** The Mentoring frame: Classes, Exams and Meetings as the main tabs, supporting areas as a quieter row, and a breadcrumb trail. */
export function MentoringShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '/mentoring';
  const { hasPermission } = usePermissions();
  const primary = primaryNav(hasPermission);
  const secondary = secondaryNav(hasPermission);
  const params = useSearchParams();
  const query = { status: params?.get('status'), card: params?.get('card') };
  const notice = readOnlyNotice(hasPermission);
  const [detail, setDetail] = React.useState<string | undefined>(undefined);
  const crumbs = breadcrumbsOf(pathname, detail, hasPermission);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <nav aria-label="Breadcrumb">
          <ol className="flex flex-wrap items-center gap-1 text-sm text-slate-600">
            {crumbs.map((c, i) => (
              <li key={`${c.label}-${i}`} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />}
                {c.href && i < crumbs.length - 1
                  ? <Link href={c.href} className={`rounded px-0.5 hover:text-slate-900 hover:underline ${RING}`}>{c.label}</Link>
                  : <span aria-current="page" className="font-medium text-slate-900">{c.label}</span>}
              </li>
            ))}
          </ol>
        </nav>
        {primary.length > 0 && (
          <nav aria-label="Mentoring workspaces" className="-mx-1 overflow-x-auto px-1">
            <ul className="flex min-w-max gap-1 border-b border-slate-200">
              {primary.map((n) => {
                const active = isCurrent(n, pathname, query);
                return (
                  <li key={n.href}>
                    <Link href={n.href} aria-current={active ? 'page' : undefined}
                      className={`-mb-px inline-flex min-h-11 items-center border-b-2 px-4 text-base font-semibold ${RING} ${active ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-600 hover:text-slate-900'}`}>
                      {n.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        )}
        {secondary.length > 0 && (
          <nav aria-label="More Mentoring areas" className="-mx-1 overflow-x-auto px-1">
            <ul className="flex min-w-max items-center gap-1 text-sm">
              {secondary.map((n) => {
                const active = isCurrent(n, pathname, query);
                return (
                  <li key={n.href}>
                    <Link href={n.href} aria-current={active ? 'page' : undefined}
                      className={`inline-flex min-h-9 items-center rounded-md px-3 ${RING} ${active ? 'bg-slate-100 font-medium text-slate-900' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}>
                      {n.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        )}
      </div>
      {notice && <p role="note" className="flex items-start gap-2 rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-800" data-testid="read-only-notice"><Eye className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{notice}</p>}
      <CrumbContext.Provider value={setDetail}><div>{children}</div></CrumbContext.Provider>
    </div>
  );
}
