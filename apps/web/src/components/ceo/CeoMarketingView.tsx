import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { fetchApi } from '@/lib/api/client';
import { resolvePeriodToQueryString } from './utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';

export async function CeoMarketingView({ searchParams }: { searchParams: { from?: string; to?: string; period?: string } }) {
  const apiQs = resolvePeriodToQueryString(searchParams);
  let data: any = null;
  let error = null;

  try {
    const res = await fetchApi<any>(`/analytics/ceo/marketing${apiQs}`);
    data = res.data;
  } catch (e: any) {
    error = e.message;
  }

  return (
    <div className="space-y-6 mb-8 border-b border-slate-200 pb-8">
      <div className="flex items-center space-x-4 bg-slate-900 text-white p-6 rounded-xl shadow-lg">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white">Executive Marketing Analytics</h2>
          <p className="text-slate-400 text-sm mt-1">Detailed attribution and campaign performance</p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 p-4 rounded-lg border border-red-200">
          Failed to load marketing data: {error}
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="shadow-sm">
              <CardContent className="p-4">
                <p className="text-sm font-medium text-slate-500">Total Marketing Leads</p>
                <p className="text-2xl font-bold mt-1">{data.totalMarketing}</p>
              </CardContent>
            </Card>
            <Card className="shadow-sm">
              <CardContent className="p-4">
                <p className="text-sm font-medium text-slate-500">New (Period)</p>
                <p className="text-2xl font-bold mt-1 text-brand-600">{data.newMarketing}</p>
              </CardContent>
            </Card>
            <Card className="shadow-sm">
              <CardContent className="p-4">
                <p className="text-sm font-medium text-slate-500">Enrolled (Period)</p>
                <p className="text-2xl font-bold mt-1 text-emerald-600">{data.enrolled}</p>
              </CardContent>
            </Card>
            <Card className="shadow-sm">
              <CardContent className="p-4">
                <p className="text-sm font-medium text-slate-500">Conversion</p>
                <p className="text-2xl font-bold mt-1 text-emerald-600">{data.conversionRate}</p>
              </CardContent>
            </Card>
          </div>

          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle>Campaign Hierarchy</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Source / Provider</TableHead>
                      <TableHead>Campaign</TableHead>
                      <TableHead>Ad Set</TableHead>
                      <TableHead>Ad</TableHead>
                      <TableHead className="text-right">Leads Generated</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.hierarchy?.length > 0 ? data.hierarchy.map((row: any, idx: number) => (
                      <TableRow key={idx} className="hover:bg-slate-50">
                        <TableCell className="font-medium text-brand-700">{row.provider}</TableCell>
                        <TableCell>{row.campaignName || '--'}</TableCell>
                        <TableCell>{row.adsetName || '--'}</TableCell>
                        <TableCell>{row.adName || '--'}</TableCell>
                        <TableCell className="text-right font-semibold">{row._count?.leadId || 0}</TableCell>
                      </TableRow>
                    )) : (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-6 text-slate-500">No detailed interaction data found for this period.</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
