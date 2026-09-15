import * as React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { AlertCircle, Clock, CreditCard } from 'lucide-react';
import Link from 'next/link';

export function AttentionCard({ data }: { data: any }) {
  if (!data) return null;

  return (
    <Card className="shadow-sm border-rose-100 bg-rose-50/30">
      <CardHeader>
        <CardTitle className="text-rose-700 flex items-center">
          <AlertCircle className="w-5 h-5 mr-2" />
          Needs Attention
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <Link href="/follow-ups" className="bg-white p-4 rounded-lg border border-rose-100 shadow-sm flex items-start cursor-pointer hover:bg-slate-50 transition-colors block">
            <div className="flex">
              <div className="bg-amber-100 p-2 rounded-full mr-4 text-amber-600 mt-1">
                <Clock className="w-4 h-4" />
              </div>
              <div>
                <span className="font-bold text-lg text-slate-800 block leading-tight">{data.overdueFollowUps}</span>
                <span className="text-sm text-slate-600 font-medium">Overdue Follow-ups</span>
                <p className="text-xs text-slate-400 mt-1">Sales actions that missed their scheduled deadline.</p>
              </div>
            </div>
          </Link>

          <Link href="/reports" className="bg-white p-4 rounded-lg border border-rose-100 shadow-sm flex items-start cursor-pointer hover:bg-slate-50 transition-colors block">
            <div className="flex">
              <div className="bg-rose-100 p-2 rounded-full mr-4 text-rose-600 mt-1">
                <CreditCard className="w-4 h-4" />
              </div>
              <div>
                <span className="font-bold text-lg text-slate-800 block leading-tight">{data.overdueInstallments}</span>
                <span className="text-sm text-slate-600 font-medium">Overdue Installments</span>
                <p className="text-xs text-slate-400 mt-1">Pending payments that are past their due date.</p>
              </div>
            </div>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
