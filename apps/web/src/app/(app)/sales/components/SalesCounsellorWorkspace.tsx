"use client";

import * as React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import Link from 'next/link';
import { ArrowRight, Users, UserPlus, FileText, Target } from 'lucide-react';

export function SalesCounsellorWorkspace() {
  const links = [
    { title: 'My Leads', desc: 'Manage your assigned leads', href: '/leads', icon: Users, color: 'text-blue-500 bg-blue-50' },
    { title: 'My Follow-ups', desc: 'Your scheduled follow-ups', href: '/follow-ups', icon: UserPlus, color: 'text-indigo-500 bg-indigo-50' },
    { title: 'My Demos', desc: 'Your upcoming demos', href: '/demos', icon: FileText, color: 'text-emerald-500 bg-emerald-50' },
    { title: 'My Targets', desc: 'View your target progress', href: '/sales/targets', icon: Target, color: 'text-rose-500 bg-rose-50' },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      {links.map(link => (
        <Card key={link.title} className="hover:shadow-md transition-shadow">
          <Link href={link.href} className="block p-6">
            <div className={`w-12 h-12 rounded-lg flex items-center justify-center mb-4 ${link.color}`}>
              <link.icon className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900 mb-1">{link.title}</h3>
            <p className="text-sm text-slate-500 mb-4">{link.desc}</p>
            <div className="flex items-center text-sm font-medium text-brand-600">
              Open <ArrowRight className="w-4 h-4 ml-1" />
            </div>
          </Link>
        </Card>
      ))}
    </div>
  );
}
