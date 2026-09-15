import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft, User, PhoneCall, Trophy, Target } from 'lucide-react';
import { fetchApi } from '@/lib/api/client';
import { resolvePeriodToQueryString } from '@/components/ceo/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';

export default async function CounsellorPerformancePage({ 
  params, 
  searchParams 
}: { 
  params: { id: string },
  searchParams: { from?: string; to?: string; period?: string } 
}) {
  const apiQs = resolvePeriodToQueryString(searchParams);
  let data: any = null;
  let counsellorData: any = null;
  let error = null;

  try {
    const res = await fetchApi<any>(`/analytics/ceo/sales${apiQs}`);
    data = res.data;
    if (data && data.performance) {
      counsellorData = data.performance.find((c: any) => c.id === params.id);
    }
    
    if (!counsellorData) {
      error = "Counsellor not found or has no activity in this period.";
    }
  } catch (e: any) {
    error = e.message;
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto mb-12">
      <div className="flex items-center space-x-4">
        <Link href={`/sales${apiQs}`} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
          <ArrowLeft className="w-5 h-5 text-slate-600" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {counsellorData?.name || 'Counsellor Profile'}
          </h1>
          <p className="text-slate-500 text-sm">Individual sales performance metrics</p>
        </div>
      </div>

      {error && (
        <div className="bg-amber-50 text-amber-700 p-4 rounded-lg border border-amber-200">
          {error}
        </div>
      )}

      {counsellorData && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="shadow-sm border-l-4 border-l-blue-500">
            <CardContent className="p-6">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm font-medium text-slate-500 mb-1">Assigned Leads</p>
                  <h3 className="text-3xl font-bold text-slate-900">{counsellorData.assigned}</h3>
                </div>
                <div className="p-3 bg-blue-50 text-blue-600 rounded-lg">
                  <User className="w-5 h-5" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm border-l-4 border-l-amber-500">
            <CardContent className="p-6">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm font-medium text-slate-500 mb-1">Contacted</p>
                  <h3 className="text-3xl font-bold text-slate-900">{counsellorData.contacted}</h3>
                </div>
                <div className="p-3 bg-amber-50 text-amber-600 rounded-lg">
                  <PhoneCall className="w-5 h-5" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm border-l-4 border-l-emerald-500">
            <CardContent className="p-6">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm font-medium text-slate-500 mb-1">Enrolled</p>
                  <h3 className="text-3xl font-bold text-slate-900">{counsellorData.enrolled}</h3>
                </div>
                <div className="p-3 bg-emerald-50 text-emerald-600 rounded-lg">
                  <Trophy className="w-5 h-5" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm border-l-4 border-l-purple-500">
            <CardContent className="p-6">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm font-medium text-slate-500 mb-1">Conversion %</p>
                  <h3 className="text-3xl font-bold text-slate-900">{counsellorData.conversionRate}</h3>
                </div>
                <div className="p-3 bg-purple-50 text-purple-600 rounded-lg">
                  <Target className="w-5 h-5" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
