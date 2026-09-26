import { ReactNode } from 'react';
import Link from 'next/link';

export default function TutorHrLayout({ children }: { children: ReactNode }) {
  const tabs = [
    { name: 'Leads', href: '/tutor-hr/leads' },
    { name: 'Settings', href: '/tutor-hr/settings' },
  ];

  return (
    <div className="flex flex-col h-full">
      <div className="bg-white border-b px-6 py-3 flex-shrink-0">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Tutor HR</h1>
        <div className="flex gap-4">
          {tabs.map((tab) => (
            <Link key={tab.href} href={tab.href} className="text-sm font-medium text-gray-600 hover:text-primary">
              {tab.name}
            </Link>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-auto p-6 bg-gray-50">
        {children}
      </div>
    </div>
  );
}
