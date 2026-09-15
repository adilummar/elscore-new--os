'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ReactNode } from 'react';

import { Tabs } from '../../../components/ui/Tabs';
import { clsx } from 'clsx';

export default function MarketingLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  const tabs = [
    { label: 'Overview', href: '/marketing', current: pathname === '/marketing' },
    { label: 'Leads', href: '/marketing/leads', current: pathname === '/marketing/leads' },
    { label: 'Attribution', href: '/marketing/attribution', current: pathname === '/marketing/attribution' },
    { label: 'Activity Logs', href: '/marketing/activity', current: pathname === '/marketing/activity' },
  ];

  return (
    <div className="space-y-6 p-6">
      <div className="border-b border-gray-200">
        <Tabs>
          <nav className="-mb-px flex space-x-8" aria-label="Tabs">
            {tabs.map((tab) => (
              <Link
                key={tab.label}
                href={tab.href}
                className={clsx(
                  tab.current
                    ? 'border-teal-500 text-teal-600'
                    : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700',
                  'whitespace-nowrap border-b-2 py-4 px-1 text-sm font-medium'
                )}
                aria-current={tab.current ? 'page' : undefined}
              >
                {tab.label}
              </Link>
            ))}
          </nav>
        </Tabs>
      </div>
      <div>{children}</div>
    </div>
  );
}
