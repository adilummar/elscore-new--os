'use client';

import Link from 'next/link';

import { Card } from '../../../../components/ui/Card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../../components/ui/Table';

interface MarketingAttributionListProps {
  initialData: {
    data: any[];
    pagination: { nextCursor: string | null; hasNextPage: boolean };
  };
}

export function MarketingAttributionList({ initialData }: MarketingAttributionListProps) {
  const items = initialData.data || [];
  if (!items || items.length === 0) {
    return (
      <Card className="p-12 text-center">
        <h3 className="text-lg font-medium text-gray-900">No marketing attribution found</h3>
        <p className="mt-2 text-sm text-gray-500">
          No leads with marketing attribution available.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Lead Name</TableHead>
              <TableHead>Provider</TableHead>
              <TableHead>External Lead ID</TableHead>
              <TableHead>Campaign</TableHead>
              <TableHead>Ad Set</TableHead>
              <TableHead>Ad</TableHead>
              <TableHead>Received At</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((lead: any) => {
              const interaction = lead.marketingInteractions?.[0];
              const attribution = lead.marketingAttribution;
              const received = interaction?.receivedAt || attribution?.acquiredAt;
              
              return (
                <TableRow key={lead.id}>
                  <TableCell>
                    <Link href={`/leads/${lead.id}`} className="font-medium text-teal-600 hover:text-teal-900">
                      {lead.firstName} {lead.lastName}
                    </Link>
                  </TableCell>
                  <TableCell>{interaction?.provider || attribution?.channel || '-'}</TableCell>
                  <TableCell>{interaction?.externalLeadId || attribution?.externalLeadId || '-'}</TableCell>
                  <TableCell>{interaction?.campaignName || attribution?.campaign || '-'}</TableCell>
                  <TableCell>{interaction?.adsetName || '-'}</TableCell>
                  <TableCell>{interaction?.adName || '-'}</TableCell>
                  <TableCell>{received ? new Date(received).toLocaleString() : '-'}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
      
      {initialData.pagination?.hasNextPage && (
        <div className="flex justify-center">
          <Link
            href={`/marketing/attribution?cursor=${initialData.pagination.nextCursor}`}
            className="rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
          >
            Load Next Page
          </Link>
        </div>
      )}
    </div>
  );
}
