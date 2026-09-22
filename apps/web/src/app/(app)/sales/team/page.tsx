"use client";
import * as React from 'react';
import { getRoundRobinStateAction, updateCounsellorStateAction } from '../actions';
import { Card } from '@/components/ui/Card';
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from '@/components/ui/Table';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { usePermissions } from '@/components/providers/AuthProvider';

export default function SalesTeamPage() {
  const [state, setState] = React.useState<any>(null);
  const { hasPermission } = usePermissions();

  const load = async () => {
    const res = await getRoundRobinStateAction();
    setState(res);
  };
  React.useEffect(() => { load(); }, []);

  const handleStateChange = async (userId: string, isEligible: boolean, dailyState: string) => {
    try {
      await updateCounsellorStateAction(userId, { isEligible, dailyState });
      load();
    } catch (e: any) { alert(e.message); }
  };

  const getUserDisplayName = (u: any) => {
    if (u?.employee?.firstName) {
      return `${u.employee.firstName} ${u.employee.lastName} (${u.userRoles?.[0]?.role?.name || 'Sales Staff'})`;
    }
    return u?.email || 'Unknown';
  };

  if (!state) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Sales Team</h1>
        <p className="text-sm text-slate-500 mt-1">Manage team eligibility and daily state.</p>
      </div>
      
      {/* Mobile Card View */}
      <div className="grid grid-cols-1 gap-4 md:hidden">
        {state.counsellors.map((c: any) => (
          <Card key={c.userId} className="p-4 flex flex-col gap-3">
            <div>
              <div className="font-semibold text-slate-900">{getUserDisplayName(c.user)}</div>
              <div className="text-sm text-slate-500">{c.user.email}</div>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-500">RR Eligible</span>
              <span className="font-medium">{c.isEligible ? 'Yes' : 'No'}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-500">Daily State</span>
              <StatusBadge status={c.dailyState} />
            </div>
            {hasPermission('roundrobin.manage') && (
              <div className="flex flex-col gap-2 pt-2 border-t mt-1">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className={c.isEligible ? "text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700" : "text-emerald-600 border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700"}
                  onClick={() => handleStateChange(c.userId, !c.isEligible, c.dailyState)}
                >
                  {c.isEligible ? 'Disable RR' : 'Enable RR'}
                </Button>
                <Select 
                  value={c.dailyState} 
                  onChange={e => handleStateChange(c.userId, c.isEligible, e.target.value)}
                >
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="INACTIVE_FROM_NOW">INACTIVE FROM NOW</option>
                  <option value="INACTIVE_FULL_DAY">INACTIVE FULL DAY</option>
                </Select>
              </div>
            )}
          </Card>
        ))}
      </div>

      {/* Desktop Table View */}
      <Card className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Counsellor</TableHead>
              <TableHead>RR Eligible</TableHead>
              <TableHead>Daily State</TableHead>
              {hasPermission('roundrobin.manage') && <TableHead>Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {state.counsellors.map((c: any) => (
              <TableRow key={c.userId}>
                <TableCell>
                  <div className="font-medium text-slate-900">{getUserDisplayName(c.user)}</div>
                  <div className="text-sm text-slate-500">{c.user.email}</div>
                </TableCell>
                <TableCell>{c.isEligible ? 'Yes' : 'No'}</TableCell>
                <TableCell><StatusBadge status={c.dailyState} /></TableCell>
                {hasPermission('roundrobin.manage') && (
                  <TableCell className="space-x-2 flex items-center">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className={c.isEligible ? "text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700" : "text-emerald-600 border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700"}
                      onClick={() => handleStateChange(c.userId, !c.isEligible, c.dailyState)}
                    >
                      {c.isEligible ? 'Disable RR' : 'Enable RR'}
                    </Button>
                    <Select 
                      className="w-48"
                      value={c.dailyState} 
                      onChange={e => handleStateChange(c.userId, c.isEligible, e.target.value)}
                    >
                      <option value="ACTIVE">ACTIVE</option>
                      <option value="INACTIVE_FROM_NOW">INACTIVE_FROM_NOW</option>
                      <option value="INACTIVE_FULL_DAY">INACTIVE_FULL_DAY</option>
                    </Select>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
