"use client";

import * as React from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { usePermissions } from '@/components/providers/AuthProvider';
import { Users, Briefcase, Shield, Key, ShieldOff, Database, History, Clock } from 'lucide-react';

const SETTINGS_SECTIONS = [
  {
    title: 'Organization',
    items: [
      { name: 'Users', href: '/settings/users', icon: Users, permission: 'user.read' },
      { name: 'Employees', href: '/settings/employees', icon: Briefcase, permission: 'employee.read' },
      { name: 'Departments', href: '/settings/departments', icon: Database, permission: null }, // Usually public info, maybe requires read
      { name: 'Attendance', href: '/settings/attendance', icon: Clock, permission: 'role.manage' }, // Assuming admin level
    ]
  },
  {
    title: 'Access Control',
    items: [
      { name: 'Roles', href: '/settings/roles', icon: Shield, permission: 'role.read' },
      { name: 'Permissions', href: '/settings/permissions', icon: Key, permission: 'role.manage' },
      { name: 'Delegations', href: '/settings/delegations', icon: ShieldOff, permission: 'role.manage' },
    ]
  },
  {
    title: 'CRM',
    items: [
      { name: 'Reference Data', href: '/settings/reference-data', icon: Database, permission: 'reference.manage' },
    ]
  },
  {
    title: 'Security',
    items: [
      { name: 'Audit Logs', href: '/settings/audit', icon: History, permission: 'audit.read' },
    ]
  }
];

export default function SettingsPage() {
  const { hasPermission } = usePermissions();

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Settings</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {SETTINGS_SECTIONS.map((section) => (
          <div key={section.title} className="space-y-4">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">{section.title}</h2>
            <div className="space-y-2">
              {section.items.map((item) => {
                // If permission is required and user doesn't have it, don't show
                if (item.permission && !hasPermission(item.permission)) {
                  return null;
                }
                const Icon = item.icon;
                return (
                  <Link href={item.href} key={item.name} className="block">
                    <Card className="p-4 flex items-center space-x-4 hover:border-brand-500 transition-colors">
                      <div className="bg-brand-50 p-2 rounded-lg text-brand-600">
                        <Icon className="w-5 h-5" />
                      </div>
                      <span className="font-medium text-slate-700">{item.name}</span>
                    </Card>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
