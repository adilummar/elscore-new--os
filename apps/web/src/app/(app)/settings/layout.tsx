import * as React from 'react';
import { SettingsNavigation } from './SettingsNavigation';

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
      <SettingsNavigation />
      {children}
    </div>
  );
}
