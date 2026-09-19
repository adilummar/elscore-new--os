"use client";
import * as React from 'react';
import { getMyTargetProgressAction, getAllTargetsAction, setTargetAction } from '../actions';
import { getEmployeesAction } from '@/app/(app)/leads/actions';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from '@/components/ui/Table';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Modal } from '@/components/ui/Modal';
import { usePermissions } from '@/components/providers/AuthProvider';

export default function TargetsPage() {
  const [myProgress, setMyProgress] = React.useState<any>(null);
  const [allTargets, setAllTargets] = React.useState<any[]>([]);
  const [employees, setEmployees] = React.useState<any[]>([]);
  const { hasPermission } = usePermissions();
  const canManageTargets = hasPermission('target.manage');
  const canReadTeam = hasPermission('target.read.team');

  // Show team view to Sales Head and CEO (anyone with team read access)
  const isTeamView = canReadTeam;

  const now = new Date();
  const [month, setMonth] = React.useState(now.getMonth() + 1);
  const [year, setYear] = React.useState(now.getFullYear());

  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [selectedUserId, setSelectedUserId] = React.useState('');
  const [targetType, setTargetType] = React.useState('CONVERSION_PERCENTAGE');
  const [targetValue, setTargetValue] = React.useState('');

  const load = async () => {
    try {
      const my = await getMyTargetProgressAction(month.toString(), year.toString());
      setMyProgress(my);

      if (isTeamView) {
        const all = await getAllTargetsAction(month.toString(), year.toString());
        setAllTargets(all || []);
        
        if (canManageTargets) {
          const emps = await getEmployeesAction();
          setEmployees(emps.data || []);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  React.useEffect(() => { load(); }, [month, year, isTeamView, canManageTargets]);

  const handleSetTarget = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserId || !targetValue) return;
    try {
      await setTargetAction(selectedUserId, month, year, targetType, parseFloat(targetValue));
      setIsModalOpen(false);
      load();
    } catch (e: any) {
      alert(e.message);
    }
  };

  const getUserDisplayName = (u: any) => {
    if (u?.employee?.firstName) return `${u.employee.firstName} ${u.employee.lastName}`;
    return u?.email || 'Unknown';
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Sales Targets</h1>
          <p className="text-sm text-slate-500">View and manage monthly sales targets.</p>
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

      {/* Counsellor personal view */}
      {myProgress && (
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4">
            {isTeamView ? 'My Target' : 'My Progress'} — {new Date(0, month - 1).toLocaleString('default', { month: 'long' })} {year}
          </h2>
          {myProgress.target ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <div className="text-sm text-slate-500">Target Type</div>
                <div className="font-semibold">{myProgress.target.targetType === 'REVENUE_AED' ? 'Revenue (AED)' : 'Conversion Rate'}</div>
              </div>
              <div>
                <div className="text-sm text-slate-500">Target</div>
                <div className="font-bold text-xl">{myProgress.target.targetType === 'REVENUE_AED' ? 'AED ' : ''}{myProgress.target.targetValue}{myProgress.target.targetType === 'CONVERSION_PERCENTAGE' ? '%' : ''}</div>
              </div>
              <div>
                <div className="text-sm text-slate-500">Actual</div>
                <div className="font-bold text-xl text-brand-600">{myProgress.target.targetType === 'REVENUE_AED' ? 'AED ' : ''}{myProgress.actual.toFixed(2)}{myProgress.target.targetType === 'CONVERSION_PERCENTAGE' ? '%' : ''}</div>
              </div>
              {myProgress.target.targetType === 'CONVERSION_PERCENTAGE' && (
                <div className="md:col-span-3 p-3 bg-slate-50 rounded-md text-sm text-slate-600">
                  <strong>{myProgress.numeratorCount ?? 0}</strong> PAID conversions out of <strong>{myProgress.denominatorCount ?? 0}</strong> assigned leads — need <strong>{myProgress.required ?? 0}</strong> to hit target
                </div>
              )}
              <div className="md:col-span-3">
                <div className="text-sm font-medium mb-1 flex justify-between">
                  <span>Progress</span>
                  <span>{Math.round((myProgress.progress ?? 0) * 100)}%</span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-2.5">
                  <div className="bg-brand-600 h-2.5 rounded-full" style={{ width: `${Math.min(100, Math.max(0, (myProgress.progress ?? 0) * 100))}%` }}></div>
                </div>
              </div>
              {/* Target history — show if changed mid-month */}
              {myProgress.target.history && myProgress.target.history.length > 0 && (
                <div className="md:col-span-3">
                  <div className="text-sm font-medium text-slate-500 mb-2">Target Change History</div>
                  <ul className="space-y-1">
                    {myProgress.target.history.map((h: any) => (
                      <li key={h.id} className="text-xs text-slate-500 border-l-2 border-amber-300 pl-3 py-1">
                        Changed {new Date(h.changedAt).toLocaleDateString()}: {h.previousType === 'REVENUE_AED' ? 'AED ' : ''}{h.previousValue}{h.previousType === 'CONVERSION_PERCENTAGE' ? '%' : ''} → {h.newType === 'REVENUE_AED' ? 'AED ' : ''}{h.newValue}{h.newType === 'CONVERSION_PERCENTAGE' ? '%' : ''}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <p className="text-slate-500 italic">No target set for this month.</p>
          )}
        </Card>
      )}

      {isTeamView && (
        <Card>
          <div className="p-4 flex justify-between items-center border-b">
            <h2 className="text-lg font-semibold">Team Targets</h2>
            {canManageTargets && <Button onClick={() => setIsModalOpen(true)}>Set Target</Button>}
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Counsellor</TableHead>
                <TableHead>Target Type</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Actual</TableHead>
                <TableHead>Required PAID</TableHead>
                <TableHead>Progress</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allTargets.map(t => (
                <TableRow key={t.id}>
                  <TableCell>{getUserDisplayName(t.user)}</TableCell>
                  <TableCell>{t.targetType === 'REVENUE_AED' ? 'Revenue (AED)' : 'Conversion Rate'}</TableCell>
                  <TableCell>{t.targetType === 'REVENUE_AED' ? 'AED ' : ''}{t.targetValue}{t.targetType === 'CONVERSION_PERCENTAGE' ? '%' : ''}</TableCell>
                  <TableCell>
                    {t.targetType === 'REVENUE_AED' ? 'AED ' : ''}
                    {typeof t.actual === 'number' ? t.actual.toFixed(2) : '--'}
                    {t.targetType === 'CONVERSION_PERCENTAGE' ? '%' : ''}
                    {t.targetType === 'CONVERSION_PERCENTAGE' && t.denominatorCount != null && (
                      <div className="text-xs text-slate-400">{t.numeratorCount}/{t.denominatorCount} leads</div>
                    )}
                  </TableCell>
                  <TableCell>
                    {t.targetType === 'CONVERSION_PERCENTAGE' ? `${t.required ?? '--'} PAID` : '—'}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="w-24 bg-slate-200 rounded-full h-2">
                        <div className="bg-brand-600 h-2 rounded-full" style={{ width: `${Math.min(100, Math.max(0, (t.progressRatio ?? 0) * 100))}%` }}></div>
                      </div>
                      <span className="text-xs text-slate-500">{Math.round((t.progressRatio ?? 0) * 100)}%</span>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {allTargets.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-4 text-slate-500">No targets set for this month.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      )}

      {canManageTargets && (
        <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)}>
          <h2 className="text-xl font-bold mb-4">Set Sales Target</h2>
          <form onSubmit={handleSetTarget} className="space-y-4">
            <div>
              <label className="text-sm font-medium">Counsellor</label>
              <Select required value={selectedUserId} onChange={e => setSelectedUserId(e.target.value)}>
                <option value="">-- Select --</option>
                {employees
                  .filter(e => e.employmentStatus === 'ACTIVE' && e.user?.userRoles?.some((r: any) => r.role.code.startsWith('SALES')))
                  .map(e => (
                  <option key={e.id} value={e.userId}>{e.firstName} {e.lastName}</option>
                ))}
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Target Type</label>
              <Select value={targetType} onChange={e => setTargetType(e.target.value)}>
                <option value="CONVERSION_PERCENTAGE">Conversion Rate (%) — e.g. 20 = 20%</option>
                <option value="REVENUE_AED">Revenue (AED)</option>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Target Value</label>
              <p className="text-xs text-slate-500 mb-1">
                {targetType === 'CONVERSION_PERCENTAGE' ? 'Enter as a percentage (e.g. 20 for 20%)' : 'Enter amount in AED (e.g. 200000)'}
              </p>
              <Input required type="number" step="0.01" min="0" value={targetValue} onChange={e => setTargetValue(e.target.value)} />
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>Cancel</Button>
              <Button type="submit">Set Target</Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
