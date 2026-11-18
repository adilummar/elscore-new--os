"use client";

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight, Eye } from 'lucide-react';
import { usePermissions } from '@/components/providers/AuthProvider';

import { FOCUS } from './mentoring-ui';
import { breadcrumbsOf, readOnlyNotice } from './shell-view';

const CrumbContext = React.createContext<(label: string | undefined) => void>(() => undefined);

/** A page deeper than its section names what is open (the student and subject of a class) for the breadcrumb. */
export function CrumbDetail({ label }: { label: string | undefined }) {
  const set = React.useContext(CrumbContext);
  React.useEffect(() => { set(label); return () => set(undefined); }, [label, set]);
  return null;
}

/**
 * The Mentoring frame. Navigation between Mentoring areas lives in the app sidebar (components/layout/MentoringNav), so the page itself is
 * just the work. A breadcrumb above names where you are, and a note appears for people who can look but not change.
 */
export function MentoringShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '/mentoring';
  const { hasPermission } = usePermissions();
  const notice = readOnlyNotice(hasPermission);
  const [detail, setDetail] = React.useState<string | undefined>(undefined);
  const crumbs = breadcrumbsOf(pathname, detail, hasPermission);

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <nav aria-label="Breadcrumb">
          <ol className="flex flex-wrap items-center gap-1 text-sm text-slate-600">
            {crumbs.map((c, i) => (
              <li key={`${c.label}-${i}`} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />}
                {c.href && i < crumbs.length - 1
                  ? <Link href={c.href} className={`rounded px-0.5 hover:text-slate-900 hover:underline ${FOCUS}`}>{c.label}</Link>
                  : <span aria-current="page" className="font-medium text-slate-900">{c.label}</span>}
              </li>
            ))}
          </ol>
        </nav>
      </div>

      {notice && <p role="note" className="flex items-start gap-2 rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-800" data-testid="read-only-notice"><Eye className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{notice}</p>}
      <CrumbContext.Provider value={setDetail}><div>{children}</div></CrumbContext.Provider>
    </div>
  );
}
