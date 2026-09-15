'use client';

import * as React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

export function SalesCard({ data }: { data: any }) {
  const searchParams = useSearchParams();
  const qs = searchParams.toString() ? `?${searchParams.toString()}` : '';

  if (!data) return null;

  return (
    <Card className="shadow-sm border-slate-200">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Sales Performance</CardTitle>
        <Link href={`/dashboard/ceo/sales${qs}`} className="text-sm text-brand-600 cursor-pointer font-medium hover:underline">View Sales Leaderboard &rarr;</Link>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Counsellor</TableHead>
                <TableHead className="text-right">Assigned</TableHead>
                <TableHead className="text-right">New</TableHead>
                <TableHead className="text-right">Contacted</TableHead>
                <TableHead className="text-right">Enrolled</TableHead>
                <TableHead className="text-right">Conv %</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.performance?.map((p: any) => (
                <TableRow key={p.id} className="hover:bg-slate-50 cursor-pointer">
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell className="text-right text-slate-600">{p.assigned}</TableCell>
                  <TableCell className="text-right text-slate-600">{p.newLeads}</TableCell>
                  <TableCell className="text-right text-slate-600">{p.contacted}</TableCell>
                  <TableCell className="text-right text-slate-900 font-semibold">{p.enrolled}</TableCell>
                  <TableCell className="text-right text-emerald-600 font-medium">{p.conversionRate}</TableCell>
                </TableRow>
              ))}
              {(!data.performance || data.performance.length === 0) && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-slate-500 py-6">No sales data available</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
