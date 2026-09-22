"use client";

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

export function SalesNavigation({ isSalesHead, canManageRR }: { isSalesHead: boolean, canManageRR: boolean }) {
  const pathname = usePathname();

  const links = [
    { name: 'Overview', href: '/sales' }
  ];

  if (isSalesHead || canManageRR) {
    links.push({ name: 'Sales Team', href: '/sales/team' });
    links.push({ name: 'Round Robin', href: '/sales/round-robin' });
  }

  links.push({ name: 'Distribution History', href: '/sales/round-robin/history' });
  links.push({ name: 'Targets', href: '/sales/targets' });
  
  if (isSalesHead || canManageRR) {
    links.push({ name: 'Reports', href: '/sales/reports' });
  }

  return (
    <div className="border-b border-slate-200 mb-6 overflow-x-auto">
      <nav className="-mb-px flex space-x-8" aria-label="Tabs">
        {links.map((link) => {
          const isActive = pathname === link.href;
          return (
            <Link
              key={link.name}
              href={link.href}
              className={cn(
                isActive
                  ? 'border-brand-500 text-brand-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300',
                'whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors'
              )}
            >
              {link.name}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
