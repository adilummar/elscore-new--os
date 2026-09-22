"use client";
import * as React from 'react';
import { getMomReportsAction } from '../actions';
import { Card } from '@/components/ui/Card';
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from '@/components/ui/Table';
import { Select } from '@/components/ui/Select';
import { usePermissions } from '@/components/providers/AuthProvider';

export default function ReportsPage() {
  const [reports, setReports] = React.useState<any[]>([]);
  const { hasPermission } = usePermissions();
  const canReadTeam = hasPermission('target.read.team');

  const now = new Date();
  const [month, setMonth] = React.useState(now.getMonth() + 1);
  const [year, setYear] = React.useState(now.getFullYear());

  const load = async () => {
    try {
      if (canReadTeam) {
        const data = await getMomReportsAction(month.toString(), year.toString());
        setReports(data || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  React.useEffect(() => { load(); }, [month, year, canReadTeam]);

  const getUserDisplayName = (u: any) => {
    if (u?.employee?.firstName) return `${u.employee.firstName} ${u.employee.lastName}`;
    return u?.email || 'Unknown';
  };

  if (!canReadTeam) {
    return <div className="p-6">You do not have permission to view team reports.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Sales Performance Report</h1>
          <p className="text-sm text-slate-500">Month-over-month (MoM) growth tracking for the sales team.</p>
        </div>
        <div className="flex gap-4">
          <Select value={month} onChange={(e) => setMonth(parseInt(e.target.value))}>
            {Array.from({length: 12}, (_, i) => i + 1).map(m => (
              <option key={m} value={m}>{new Date(0, m - 1).toLocaleString('default', { month: 'long' })}</option>
            ))}
          </Select>
          <Select value={year} onChange={(e) => setYear(parseInt(e.target.value))}>
            {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </Select>
        </div>
      </div>

      <Card>
        <div className="p-4 flex justify-between items-center border-b bg-slate-50">
          <h2 className="text-lg font-semibold">Counsellor Performance (MoM)</h2>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Counsellor</TableHead>
              <TableHead>Target Type</TableHead>
              <TableHead>Current Target</TableHead>
              <TableHead>Previous Month Actual</TableHead>
              <TableHead>Current Month Actual</TableHead>
              <TableHead>MoM Growth</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {reports.map((r, i) => {
              const isRevenue = r.targetType === 'REVENUE_AED';
              const prefix = isRevenue ? 'AED ' : '';
              const suffix = isRevenue ? '' : '%';
              
              const growth = r.growthRatio;
              const isPositive = growth > 0;
              const isNegative = growth < 0;
              
              return (
                <TableRow key={i}>
                  <TableCell className="font-medium">{getUserDisplayName(r.counsellor)}</TableCell>
                  <TableCell>{isRevenue ? 'Revenue (AED)' : 'Conversion Rate'}</TableCell>
                  <TableCell>{prefix}{r.targetValue}{suffix}</TableCell>
                  <TableCell className="text-slate-500">{prefix}{r.previousActual.toFixed(2)}{suffix}</TableCell>
                  <TableCell className="font-semibold">{prefix}{r.currentActual.toFixed(2)}{suffix}</TableCell>
                  <TableCell>
                    {growth === 0 ? (
                      <span className="text-slate-500 font-medium">0.00%</span>
                    ) : (
                      <span className={`font-bold flex items-center gap-1 ${isPositive ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {isPositive ? '↑' : '↓'} {Math.abs(growth).toFixed(2)}%
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
            {reports.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-6 text-slate-500">No performance data found for this period.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
} 
