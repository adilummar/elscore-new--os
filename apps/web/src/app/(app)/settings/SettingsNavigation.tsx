"use client";

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { usePermissions } from '@/components/providers/AuthProvider';

export function SettingsNavigation() {
  const pathname = usePathname();
  const { hasPermission } = usePermissions();
  
  if (pathname === '/settings') return null; // Don't show on root hub

  const links = [
    { name: 'Overview', href: '/settings' },
    ...(hasPermission('user.read') ? [{ name: 'Users', href: '/settings/users' }] : []),
    ...(hasPermission('employee.read-all') ? [{ name: 'Employees', href: '/settings/employees' }] : []),
    ...(hasPermission('role.read') ? [{ name: 'Roles', href: '/settings/roles' }] : []),
    ...(hasPermission('role.read') ? [{ name: 'Permissions', href: '/settings/permissions' }] : []),
    ...(hasPermission('role.assign') ? [{ name: 'Delegations', href: '/settings/delegations' }] : []),
    ...(hasPermission('reference.manage') ? [{ name: 'Reference Data', href: '/settings/reference-data' }] : []),
    ...(hasPermission('attendance.settings.manage') ? [{ name: 'Attendance', href: '/settings/attendance' }] : []),
    ...(hasPermission('audit.view') ? [{ name: 'Audit', href: '/settings/audit' }] : [])
  ];

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
