import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { fetchApi } from '@/lib/api/client';
import { resolvePeriodToQueryString } from './utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';

export async function CeoSalesView({ searchParams }: { searchParams: { from?: string; to?: string; period?: string } }) {
  const apiQs = resolvePeriodToQueryString(searchParams);
  let data: any = null;
  let error = null;

  try {
    const res = await fetchApi<any>(`/analytics/ceo/sales${apiQs}`);
    data = res.data;
  } catch (e: any) {
    error = e.message;
  }

  return (
    <div className="space-y-6 mb-8 border-b border-slate-200 pb-8">
      <div className="flex items-center space-x-4 bg-slate-900 text-white p-6 rounded-xl shadow-lg">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white">Executive Sales Analytics</h2>
          <p className="text-slate-400 text-sm mt-1">Sales performance and conversion metrics</p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 p-4 rounded-lg border border-red-200">
          Failed to load sales data: {error}
        </div>
      )}

      {data && (
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>Team Performance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Counsellor</TableHead>
                    <TableHead className="text-right">Assigned Leads</TableHead>
                    <TableHead className="text-right">New (Period)</TableHead>
                    <TableHead className="text-right">Contacted</TableHead>
                    <TableHead className="text-right">Enrolled</TableHead>
                    <TableHead className="text-right">Conv %</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.performance?.length > 0 ? data.performance.map((p: any) => (
                    <TableRow key={p.id} className="hover:bg-slate-50">
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell className="text-right">{p.assigned}</TableCell>
                      <TableCell className="text-right text-brand-600">{p.newLeads}</TableCell>
                      <TableCell className="text-right">{p.contacted}</TableCell>
                      <TableCell className="text-right font-semibold text-emerald-600">{p.enrolled}</TableCell>
                      <TableCell className="text-right font-bold text-emerald-700">{p.conversionRate}</TableCell>
                      <TableCell className="text-right">
                        <Link href={`/sales/counsellor/${p.id}${apiQs}`} className="text-brand-600 text-sm hover:underline font-medium">
                          Inspect &rarr;
                        </Link>
                      </TableCell>
                    </TableRow>
                  )) : (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-6 text-slate-500">No active sales counsellors found.</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
