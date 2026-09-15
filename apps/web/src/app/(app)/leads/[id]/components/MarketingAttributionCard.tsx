import * as React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';

export function MarketingAttributionCard({ lead }: { lead: any }) {
  const interaction = lead.marketingInteractions?.[0];
  const attribution = lead.marketingAttribution;

  if (!interaction && !attribution) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Marketing Attribution</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-gray-500 font-medium">Provider</p>
            <p className="mt-1">{interaction?.provider || attribution?.channel || '-'}</p>
          </div>
          <div>
            <p className="text-gray-500 font-medium">External Lead ID</p>
            <p className="mt-1">{interaction?.externalLeadId || attribution?.externalLeadId || '-'}</p>
          </div>
          <div>
            <p className="text-gray-500 font-medium">Campaign</p>
            <p className="mt-1">{interaction?.campaignName || attribution?.campaign || '-'}</p>
          </div>
          <div>
            <p className="text-gray-500 font-medium">Ad Set</p>
            <p className="mt-1">{interaction?.adsetName || '-'}</p>
          </div>
          <div>
            <p className="text-gray-500 font-medium">Ad</p>
            <p className="mt-1">{interaction?.adName || '-'}</p>
          </div>
          <div>
            <p className="text-gray-500 font-medium">Received At</p>
            <p className="mt-1">
              {interaction?.receivedAt
                ? new Date(interaction.receivedAt).toLocaleString()
                : attribution?.acquiredAt
                  ? new Date(attribution.acquiredAt).toLocaleString()
                  : '-'}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
