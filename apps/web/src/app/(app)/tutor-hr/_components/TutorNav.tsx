"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const SECTIONS = [
  { name: 'Hiring', href: '/tutor-hr/hiring' },
  { name: 'Training', href: '/tutor-hr/training' },
  { name: 'Pay Slabs', href: '/tutor-hr/pay-slabs' },
  { name: 'Tutors', href: '/tutor-hr/tutors' },
];

const LEGACY = [
  { name: 'Legacy leads', href: '/tutor-hr/leads' },
  { name: 'Reviews', href: '/tutor-hr/reviews' },
  { name: 'Settings', href: '/tutor-hr/settings' },
];

export function TutorNav() {
  const pathname = usePathname();
  const active = (href: string) => pathname === href || pathname.startsWith(href + '/');
  return (
    <nav aria-label="Tutor Management sections" className="flex items-end justify-between gap-4 overflow-x-auto">
      <ul className="flex gap-1">
        {SECTIONS.map((s) => (
          <li key={s.href}>
            <Link
              href={s.href}
              aria-current={active(s.href) ? 'page' : undefined}
              className={cn(
                'inline-flex items-center h-11 px-4 text-sm font-medium border-b-2 whitespace-nowrap transition-colors',
                active(s.href) ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300',
              )}
            >
              {s.name}
            </Link>
          </li>
        ))}
      </ul>
      <ul className="hidden md:flex gap-3 pb-2 text-xs text-slate-500">
        {LEGACY.map((s) => (
          <li key={s.href}>
            <Link href={s.href} className={cn('hover:text-slate-900 whitespace-nowrap', active(s.href) && 'text-slate-900 font-medium')}>
              {s.name}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
