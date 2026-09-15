import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft, Calendar, UserX, CheckCircle, Clock } from 'lucide-react';
import { fetchApi } from '@/lib/api/client';
import { resolvePeriodToQueryString } from './utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';

export async function CeoDemosView({ searchParams }: { searchParams: { from?: string; to?: string; period?: string } }) {
  const apiQs = resolvePeriodToQueryString(searchParams);
  let data: any = null;
  let error = null;

  try {
    const res = await fetchApi<any>(`/analytics/ceo/demos${apiQs}`);
    data = res.data;
  } catch (e: any) {
    error = e.message;
  }

  return (
    <div className="space-y-6 mb-8 border-b border-slate-200 pb-8">
      <div className="flex items-center space-x-4 bg-slate-900 text-white p-6 rounded-xl shadow-lg">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white">Executive Demo Analytics</h2>
          <p className="text-slate-400 text-sm mt-1">Trial performance and tutor distribution</p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 p-4 rounded-lg border border-red-200">
          Failed to load demo data: {error}
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="shadow-sm bg-slate-900 text-white">
              <CardContent className="p-8 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-2">Total Demos</p>
                  <h2 className="text-6xl font-black">{data.total}</h2>
                </div>
                <Calendar className="w-16 h-16 opacity-20" />
              </CardContent>
            </Card>

            <Card className="shadow-sm bg-brand-50 border-brand-200">
              <CardContent className="p-8 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-brand-700 uppercase tracking-wider mb-2">Completion Rate</p>
                  <h2 className="text-6xl font-black text-brand-900">{data.completionRate}</h2>
                </div>
                <CheckCircle className="w-16 h-16 text-brand-300 opacity-50" />
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="shadow-sm border-l-4 border-l-blue-400">
              <CardContent className="p-4 flex justify-between items-center">
                <div>
                  <p className="text-sm font-medium text-slate-500">Scheduled</p>
                  <p className="text-2xl font-bold">{data.scheduled}</p>
                </div>
                <Clock className="text-blue-400" />
              </CardContent>
            </Card>
            <Card className="shadow-sm border-l-4 border-l-emerald-400">
              <CardContent className="p-4 flex justify-between items-center">
                <div>
                  <p className="text-sm font-medium text-slate-500">Completed</p>
                  <p className="text-2xl font-bold text-emerald-600">{data.completed}</p>
                </div>
                <CheckCircle className="text-emerald-400" />
              </CardContent>
            </Card>
            <Card className="shadow-sm border-l-4 border-l-red-400">
              <CardContent className="p-4 flex justify-between items-center">
                <div>
                  <p className="text-sm font-medium text-slate-500">No-Show</p>
                  <p className="text-2xl font-bold text-red-600">{data.noShow}</p>
                </div>
                <UserX className="text-red-400" />
              </CardContent>
            </Card>
            <Card className="shadow-sm border-l-4 border-l-slate-300">
              <CardContent className="p-4 flex justify-between items-center">
                <div>
                  <p className="text-sm font-medium text-slate-500">Cancelled</p>
                  <p className="text-2xl font-bold text-slate-500">{data.cancelled}</p>
                </div>
                <Calendar className="text-slate-300" />
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
