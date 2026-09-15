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

  if (!state) return null;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Sales Team</h1>
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Counsellor</TableHead>
              <TableHead>RR Eligible</TableHead>
              <TableHead>Daily State</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {state.counsellors.map((c: any) => (
              <TableRow key={c.userId}>
                <TableCell>{c.user.email}</TableCell>
                <TableCell>{c.isEligible ? 'Yes' : 'No'}</TableCell>
                <TableCell><StatusBadge status={c.dailyState} /></TableCell>
                <TableCell className="space-x-2 flex items-center">
                  {hasPermission('roundrobin.manage') && (
                    <>
                      <Button variant="outline" size="sm" onClick={() => handleStateChange(c.userId, !c.isEligible, c.dailyState)}>
                        Toggle Eligible
                      </Button>
                      <Select 
                        value={c.dailyState} 
                        onChange={e => handleStateChange(c.userId, c.isEligible, e.target.value)}
                      >
                        <option value="ACTIVE">ACTIVE</option>
                        <option value="INACTIVE_FROM_NOW">INACTIVE_FROM_NOW</option>
                        <option value="INACTIVE_FULL_DAY">INACTIVE_FULL_DAY</option>
                      </Select>
                    </>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
