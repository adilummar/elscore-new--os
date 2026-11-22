import { ReactNode } from 'react';
import { TutorNav } from './_components/TutorNav';

export default function TutorHrLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col h-full">
      <div className="bg-white border-b px-4 sm:px-6 pt-3 flex-shrink-0">
        <h1 className="text-lg font-semibold text-slate-900 mb-1">Tutor Management</h1>
        <TutorNav />
      </div>
      <div className="flex-1 overflow-auto p-4 sm:p-6 bg-gray-50">{children}</div>
    </div>
  );
}
