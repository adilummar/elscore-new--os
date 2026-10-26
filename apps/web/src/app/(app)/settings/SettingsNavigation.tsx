"use client";

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { usePermissions } from '@/components/providers/AuthProvider';
import { getSettingsNavigationLinks } from './settings-navigation-links';

export function SettingsNavigation() {
  const pathname = usePathname();
  const { hasPermission } = usePermissions();
  
  if (pathname === '/settings') return null; // Don't show on root hub

  const links = getSettingsNavigationLinks(hasPermission);

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
