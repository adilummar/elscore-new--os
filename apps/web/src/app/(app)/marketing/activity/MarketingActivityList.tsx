'use client';

import Link from 'next/link';

import { Card } from '../../../../components/ui/Card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../../components/ui/Table';

interface MarketingActivityListProps {
  initialData: {
    data: any[];
    pagination: { nextCursor: string | null; hasNextPage: boolean };
  };
}

export function MarketingActivityList({ initialData }: MarketingActivityListProps) {
  const items = initialData.data || [];
  if (!items || items.length === 0) {
    return (
      <Card className="p-12 text-center">
        <h3 className="text-lg font-medium text-gray-900">No marketing activity found</h3>
        <p className="mt-2 text-sm text-gray-500">
          Webhook ingestions will appear here.
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
              <TableHead>Timestamp</TableHead>
              <TableHead>Provider</TableHead>
              <TableHead>Event Type</TableHead>
              <TableHead>External Lead ID</TableHead>
              <TableHead>Related Lead</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((log: any, idx: number) => (
              <TableRow key={log.id || idx}>
                <TableCell>{new Date(log.receivedAt).toLocaleString()}</TableCell>
                <TableCell>{log.provider}</TableCell>
                <TableCell>
                  {log.isOriginal ? (
                    <span className="inline-flex items-center rounded-md bg-green-50 px-2 py-1 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-600/20">New Lead</span>
                  ) : (
                    <span className="inline-flex items-center rounded-md bg-yellow-50 px-2 py-1 text-xs font-medium text-yellow-800 ring-1 ring-inset ring-yellow-600/20">Duplicate Event</span>
                  )}
                </TableCell>
                <TableCell>{log.externalLeadId}</TableCell>
                <TableCell>
                  {log.lead ? (
                    <Link href={`/leads/${log.lead.id}`} className="text-teal-600 hover:text-teal-900 font-medium">
                      {log.lead.firstName} {log.lead.lastName}
                    </Link>
                  ) : (
                    '-'
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
      
      {initialData.pagination?.hasNextPage && (
        <div className="flex justify-center">
          <Link
            href={`/marketing/activity?cursor=${initialData.pagination.nextCursor}`}
            className="rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
          >
            Load Next Page
          </Link>
        </div>
      )}
    </div>
  );
}
