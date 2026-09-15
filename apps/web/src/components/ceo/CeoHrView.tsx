import * as React from 'react';
import Link from 'next/link';
import { Users, UserCheck, UserMinus } from 'lucide-react';
import { fetchApi } from '@/lib/api/client';
import { resolvePeriodToQueryString } from './utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';

export async function CeoHrView({ searchParams }: { searchParams: { from?: string; to?: string; period?: string } }) {
  const apiQs = resolvePeriodToQueryString(searchParams);
  let data: any = null;
  let error = null;

  try {
    const res = await fetchApi<any>(`/analytics/ceo/hr`); // HR might not have date filter
    data = res.data;
  } catch (e: any) {
    error = e.message;
  }

  return (
    <div className="space-y-6 mb-8 border-b border-slate-200 pb-8">
      <div className="flex items-center space-x-4 bg-slate-900 text-white p-6 rounded-xl shadow-lg">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white">Executive HR Analytics</h2>
          <p className="text-slate-400 text-sm mt-1">Headcount and department distribution</p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 p-4 rounded-lg border border-red-200">
          Failed to load HR data: {error}
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="shadow-sm">
              <CardContent className="p-6 flex items-center">
                <div className="p-3 bg-blue-50 text-blue-600 rounded-full mr-4">
                  <Users className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-500 uppercase tracking-wider mb-1">Total Employees</p>
                  <h2 className="text-3xl font-bold">{data.total}</h2>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-sm border-l-4 border-l-emerald-500">
              <CardContent className="p-6 flex items-center">
                <div className="p-3 bg-emerald-50 text-emerald-600 rounded-full mr-4">
                  <UserCheck className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-500 uppercase tracking-wider mb-1">Active Headcount</p>
                  <h2 className="text-3xl font-bold text-emerald-700">{data.active}</h2>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-sm border-l-4 border-l-slate-300">
              <CardContent className="p-6 flex items-center">
                <div className="p-3 bg-slate-100 text-slate-500 rounded-full mr-4">
                  <UserMinus className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-500 uppercase tracking-wider mb-1">Inactive / Former</p>
                  <h2 className="text-3xl font-bold text-slate-600">{data.inactive}</h2>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="shadow-sm mt-6">
            <CardHeader>
              <CardTitle>Headcount by Department (Active)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="max-w-2xl">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Department</TableHead>
                      <TableHead className="text-right">Active Employees</TableHead>
                      <TableHead className="text-right">% of Workforce</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.headcountByDept?.map((d: any, idx: number) => {
                      const percentage = data.active > 0 ? ((d.count / data.active) * 100).toFixed(1) : 0;
                      return (
                        <TableRow key={idx} className="hover:bg-slate-50">
                          <TableCell className="font-medium text-slate-800">{d.department}</TableCell>
                          <TableCell className="text-right font-bold text-slate-900">{d.count}</TableCell>
                          <TableCell className="text-right text-slate-500">{percentage}%</TableCell>
                        </TableRow>
                      );
                    })}
                    {(!data.headcountByDept || data.headcountByDept.length === 0) && (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center py-6 text-slate-500">No active employees found across departments.</TableCell>
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
