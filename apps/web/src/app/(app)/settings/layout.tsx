import * as React from 'react';

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6 max-w-7xl mx-auto p-8">
      {children}
    </div>
  );
}
