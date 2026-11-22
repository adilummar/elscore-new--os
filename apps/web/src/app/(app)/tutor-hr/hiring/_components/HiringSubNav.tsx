"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { usePermissions } from '@/components/providers/AuthProvider';
import { cn } from '@/lib/utils';

export function HiringSubNav() {
  const pathname = usePathname();
  const { hasPermission } = usePermissions();
  const items = [
    { name: 'Dashboard', href: '/tutor-hr/hiring', exact: true },
    { name: 'Candidates', href: '/tutor-hr/hiring/candidates' },
    { name: 'Demos', href: '/tutor-hr/hiring/demos' },
    ...(hasPermission('tutor_hiring.report') ? [{ name: 'Reports', href: '/tutor-hr/hiring/reports' }] : []),
    ...(hasPermission('tutor_hiring.settings') ? [{ name: 'Settings', href: '/tutor-hr/hiring/settings' }] : []),
  ];
  const isActive = (i: { href: string; exact?: boolean }) =>
    i.exact ? pathname === i.href : pathname === i.href || pathname.startsWith(i.href + '/');
  return (
    <nav aria-label="Hiring" className="flex gap-1 overflow-x-auto rounded-lg bg-white border border-slate-200 p-1 w-fit max-w-full">
      {items.map((i) => (
        <Link
          key={i.href}
          href={i.href}
          aria-current={isActive(i) ? 'page' : undefined}
          className={cn(
            'px-3 h-9 inline-flex items-center rounded-md text-sm font-medium whitespace-nowrap transition-colors',
            isActive(i) ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100',
          )}
        >
          {i.name}
        </Link>
      ))}
    </nav>
  );
}
