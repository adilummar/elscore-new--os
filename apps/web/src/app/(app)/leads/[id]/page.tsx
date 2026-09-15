import * as React from 'react';
import { LeadDetailClient } from './components/LeadDetailClient';

export default function LeadDetailPage({ params }: { params: { id: string } }) {
  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <LeadDetailClient leadId={params.id} />
    </div>
  );
}
