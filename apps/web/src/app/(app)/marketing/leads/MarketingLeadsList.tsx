'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { Card } from '../../../../components/ui/Card';
import { StatusBadge } from '../../../../components/ui/StatusBadge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../../components/ui/Table';

interface MarketingLeadsListProps {
  initialData: {
    data: any[];
    pagination: { nextCursor: string | null; hasNextPage: boolean };
  };
  searchParams: { search?: string; status?: string };
}

export function MarketingLeadsList({ initialData, searchParams }: MarketingLeadsListProps) {
  const router = useRouter();

  const items = initialData.data || [];

  if (!items || items.length === 0) {
    return (
      <Card className="p-12 text-center">
        <h3 className="text-lg font-medium text-gray-900">No marketing leads found</h3>
        <p className="mt-2 text-sm text-gray-500">
          Try adjusting your search or filters to find what you&apos;re looking for.
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
              <TableHead>Phone</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Provider</TableHead>
              <TableHead>Campaign</TableHead>
              <TableHead>Ad Set</TableHead>
              <TableHead>Ad</TableHead>
              <TableHead>Created Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((lead: any) => {
              const interaction = lead.marketingInteractions?.[0];
              const attribution = lead.marketingAttribution;

              return (
                <TableRow key={lead.id}>
                  <TableCell>
                    <Link href={`/leads/${lead.id}`} className="font-medium text-teal-600 hover:text-teal-900">
                      {lead.firstName} {lead.lastName}
                    </Link>
                  </TableCell>
                  <TableCell>{lead.primaryPhone || '-'}</TableCell>
                  <TableCell><StatusBadge status={lead.status} /></TableCell>
                  <TableCell>{interaction?.provider || attribution?.channel || '-'}</TableCell>
                  <TableCell>{interaction?.campaignName || attribution?.campaign || '-'}</TableCell>
                  <TableCell>{interaction?.adsetName || '-'}</TableCell>
                  <TableCell>{interaction?.adName || '-'}</TableCell>
                  <TableCell>{new Date(lead.createdAt).toLocaleDateString()}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
      
      {initialData.pagination?.hasNextPage && (
        <div className="flex justify-center">
          <Link
            href={`/marketing/leads?cursor=${initialData.pagination.nextCursor}`}
            className="rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
          >
            Load Next Page
          </Link>
        </div>
      )}
    </div>
  );
}
