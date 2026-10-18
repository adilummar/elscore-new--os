import * as React from 'react';
import { LeadDetailClient } from './components/LeadDetailClient';
import { getLeadAction } from '../actions';

export default async function LeadDetailPage({ params }: { params: { id: string } }) {
  let initialLead = null;
  let initialError: string | null = null;

  try {
    initialLead = await getLeadAction(params.id);
  } catch (err: any) {
    initialError = err.message || 'Failed to load lead details';
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <LeadDetailClient
        leadId={params.id}
        initialLead={initialLead}
        initialError={initialError}
      />
    </div>
  );
}
