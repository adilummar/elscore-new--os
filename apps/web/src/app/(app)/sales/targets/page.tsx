"use client";
import * as React from 'react';
import { getMyTargetProgressAction, getAllTargetsAction, setTargetAction, getTeamTargetAction, setTeamBundleAction, deleteTargetAction, deleteTeamTargetAction } from '../actions';
import { getEmployeesAction } from '@/app/(app)/leads/actions';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from '@/components/ui/Table';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Modal } from '@/components/ui/Modal';
import { usePermissions } from '@/components/providers/AuthProvider';
import { Plus, Trash2, Edit2 } from 'lucide-react';

export default function TargetsPage() {
  const [myProgress, setMyProgress] = React.useState<any>(null);
  const [allTargets, setAllTargets] = React.useState<any[]>([]);
  const [employees, setEmployees] = React.useState<any[]>([]);
  const [teamTargetData, setTeamTargetData] = React.useState<any>(null);
  const { hasPermission } = usePermissions();
  const canManageTargets = hasPermission('target.manage');
  const canReadTeam = hasPermission('target.read.team');

  const isTeamView = canReadTeam;

  const now = new Date();
  const [month, setMonth] = React.useState(now.getMonth() + 1);
  const [year, setYear] = React.useState(now.getFullYear());

  // Modal State
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [targetMode, setTargetMode] = React.useState<'TEAM' | 'INDIVIDUAL'>('TEAM');

  // Individual Form State
  const [indUserId, setIndUserId] = React.useState('');
  const [indType, setIndType] = React.useState('CONVERSION_PERCENTAGE');
  const [indValue, setIndValue] = React.useState('');

  // Team Form State
  const [teamVal, setTeamVal] = React.useState('');
  const [allocations, setAllocations] = React.useState<{userId: string, targetValue: string}[]>([]);

  const load = async () => {
    try {
      const my = await getMyTargetProgressAction(month.toString(), year.toString());
      setMyProgress(my);

      if (isTeamView) {
        const all = await getAllTargetsAction(month.toString(), year.toString());
        setAllTargets(all || []);
        
        if (canManageTargets) {
          const emps = await getEmployeesAction();
          const empsData = emps.data || [];
          setEmployees(empsData);
          // Find Sales department ID safely (department relation might not be included)
          const salesEmp = empsData.find((e: any) => e.user?.userRoles?.some((r: any) => r.role.code.startsWith('SALES')));
          const salesDept = salesEmp?.departmentId;
          if (salesDept) {
             const tt = await getTeamTargetAction(salesDept, month.toString(), year.toString());
             setTeamTargetData(tt);
          }
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  React.useEffect(() => { load(); }, [month, year, isTeamView, canManageTargets]);

  const handleOpenModal = () => {
    setIndUserId('');
    setIndValue('');
    setTeamVal('');
    setAllocations([]);
    setIsModalOpen(true);
  };

  const handleAddAllocation = () => {
    setAllocations([...allocations, { userId: '', targetValue: '' }]);
  };

  const handleRemoveAllocation = (index: number) => {
    setAllocations(allocations.filter((_, i) => i !== index));
  };

  const handleAllocationChange = (index: number, field: 'userId' | 'targetValue', value: string) => {
    const newAlloc = [...allocations];
    newAlloc[index][field] = value;
    setAllocations(newAlloc);
  };

  const handleEditTeam = () => {
    setTargetMode('TEAM');
    setTeamVal(teamTargetData.teamTarget.targetValue);
    const allocs = allTargets
      .filter(t => t.targetType === 'REVENUE_AED')
      .map(t => ({ userId: t.userId, targetValue: t.targetValue.toString() }));
    setAllocations(allocs);
    setIsModalOpen(true);
  };

  const handleDeleteTeam = async () => {
    if (!confirm('Are you sure you want to delete the overall team target? This will NOT delete individual targets.')) return;
    try {
       await deleteTeamTargetAction(teamTargetData.teamTarget.departmentId, month, year);
       load();
    } catch (e: any) { alert(e.message); }
  };

  const handleEditIndividual = (target: any) => {
    setTargetMode('INDIVIDUAL');
    setIndUserId(target.userId);
    setIndType(target.targetType);
    setIndValue(target.targetValue);
    setIsModalOpen(true);
  };

  const handleDeleteIndividual = async (id: string) => {
    if (!confirm('Are you sure you want to delete this target?')) return;
    try {
      await deleteTargetAction(id);
      load();
    } catch (e: any) { alert(e.message); }
  };

  const currentTotalAllocated = allocations.reduce((acc, curr) => acc + (parseFloat(curr.targetValue) || 0), 0);
  const unallocatedPreview = Math.max(0, (parseFloat(teamVal) || 0) - currentTotalAllocated);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (targetMode === 'INDIVIDUAL') {
        if (!indUserId || !indValue) return alert('Please fill all fields');
        await setTargetAction(indUserId, month, year, indType, parseFloat(indValue));
      } else {
        if (!teamVal) return alert('Please enter team target amount');
        const salesEmp = employees?.find((e: any) => e.user?.userRoles?.some((r: any) => r.role.code.startsWith('SALES')));
        const salesDept = salesEmp?.departmentId;
        if (!salesDept) return alert('Sales department not found');
        
        const validAllocations = allocations
          .filter(a => a.userId && a.targetValue)
          .map(a => ({
            userId: a.userId,
            targetType: 'REVENUE_AED',
            targetValue: parseFloat(a.targetValue)
          }));

        await setTeamBundleAction(salesDept, month, year, 'REVENUE_AED', parseFloat(teamVal), validAllocations);
      }
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

  const activeSalesEmployees = employees.filter(e => e.employmentStatus === 'ACTIVE' && e.user?.userRoles?.some((r: any) => r.role.code.startsWith('SALES')));

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Sales Targets</h1>
          <p className="text-sm text-slate-500">View and manage monthly sales targets.</p>
        </div>
        <div className="flex gap-4 items-center">
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
          {canManageTargets && (
            <Button onClick={handleOpenModal} className="ml-2">Set Target</Button>
          )}
        </div>
      </div>

      {isTeamView && teamTargetData && teamTargetData.teamTarget && (
        <Card className="p-6 bg-slate-50 border-brand-200">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h2 className="text-xl font-bold text-slate-800">Overall Team Target Completion</h2>
              <p className="text-sm text-slate-500">Tracking the entire team&apos;s performance against the overarching goal.</p>
            </div>
            {canManageTargets && (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleEditTeam}><Edit2 className="w-4 h-4 mr-2" /> Edit</Button>
                <Button variant="outline" size="sm" className="text-rose-600 hover:text-rose-700 hover:bg-rose-50" onClick={handleDeleteTeam}><Trash2 className="w-4 h-4 mr-2" /> Delete</Button>
              </div>
            )}
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
            <div className="bg-white p-4 rounded-md shadow-sm border border-brand-200">
              <div className="text-sm text-brand-600 font-medium">Team Target</div>
              <div className="text-2xl font-bold text-brand-700">AED {Number(teamTargetData.teamTarget.targetValue).toLocaleString()}</div>
            </div>
            <div className="bg-white p-4 rounded-md shadow-sm border">
              <div className="text-sm text-emerald-600 font-medium">Team Actual Achieved</div>
              <div className="text-2xl font-bold text-emerald-700">AED {teamTargetData.teamActual?.toLocaleString(undefined, {minimumFractionDigits: 2})}</div>
            </div>
            <div className="bg-white p-4 rounded-md shadow-sm border">
              <div className="text-sm text-slate-500">Allocated to Staff</div>
              <div className="text-xl font-semibold text-slate-700">AED {teamTargetData.totalAllocated?.toLocaleString()}</div>
            </div>
            <div className="bg-white p-4 rounded-md shadow-sm border border-amber-200">
              <div className="text-sm text-amber-600 font-medium">Head&apos;s Gap Responsibility</div>
              <div className="text-xl font-bold text-amber-700">AED {teamTargetData.unallocated?.toLocaleString()}</div>
            </div>
          </div>
          
          <div className="bg-white p-5 rounded-md border shadow-sm">
            <div className="flex justify-between text-sm font-semibold mb-2">
              <span className="text-slate-600">Sales Head / Team Progress</span>
              <span className="text-brand-600">{Math.round(teamTargetData.teamProgress || 0)}%</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-4 overflow-hidden shadow-inner">
              <div 
                className={`h-4 rounded-full transition-all duration-500 ${teamTargetData.teamProgress >= 100 ? 'bg-emerald-500' : 'bg-brand-500'}`}
                style={{ width: `${Math.min(100, Math.max(0, teamTargetData.teamProgress || 0))}%` }}
              ></div>
            </div>
          </div>
        </Card>
      )}

      {isTeamView && !teamTargetData?.teamTarget && canManageTargets && (
        <Card className="p-6 bg-slate-50 border-dashed border-slate-300 flex flex-col items-center justify-center">
          <p className="text-slate-500 mb-4">No team target set for this month.</p>
          <Button variant="outline" onClick={handleOpenModal}>Set Target</Button>
        </Card>
      )}

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
              <div className="md:col-span-3">
                <div className="text-sm font-medium mb-1 flex justify-between">
                  <span>Progress</span>
                  <span>{Math.round((myProgress.progress ?? 0) * 100)}%</span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-2.5">
                  <div className="bg-brand-600 h-2.5 rounded-full" style={{ width: `${Math.min(100, Math.max(0, (myProgress.progress ?? 0) * 100))}%` }}></div>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-slate-500 italic">No target set for this month.</p>
          )}
        </Card>
      )}

      {isTeamView && (
        <Card>
          <div className="p-4 flex justify-between items-center border-b">
            <h2 className="text-lg font-semibold">Individual Member Progress</h2>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Counsellor</TableHead>
                <TableHead>Target Type</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Actual</TableHead>
                <TableHead>Uncompleted Gap</TableHead>
                <TableHead>Progress</TableHead>
                {canManageTargets && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {allTargets.map(t => {
                const actual = typeof t.actual === 'number' ? t.actual : 0;
                const gap = Math.max(0, Number(t.targetValue) - actual);
                const isMet = actual >= Number(t.targetValue);
                return (
                <TableRow key={t.id}>
                  <TableCell>{getUserDisplayName(t.user)}</TableCell>
                  <TableCell>{t.targetType === 'REVENUE_AED' ? 'Revenue (AED)' : 'Conversion Rate'}</TableCell>
                  <TableCell>{t.targetType === 'REVENUE_AED' ? 'AED ' : ''}{t.targetValue}{t.targetType === 'CONVERSION_PERCENTAGE' ? '%' : ''}</TableCell>
                  <TableCell>
                    {t.targetType === 'REVENUE_AED' ? 'AED ' : ''}
                    {actual.toFixed(2)}
                    {t.targetType === 'CONVERSION_PERCENTAGE' ? '%' : ''}
                  </TableCell>
                  <TableCell>
                    {isMet ? (
                       <span className="text-emerald-600 font-medium text-xs bg-emerald-50 px-2 py-1 rounded">Target Met</span>
                    ) : (
                       <span className="text-rose-600 font-medium">
                         {t.targetType === 'REVENUE_AED' ? 'AED ' : ''}{gap.toFixed(2)}{t.targetType === 'CONVERSION_PERCENTAGE' ? '%' : ''} left
                       </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="w-24 bg-slate-200 rounded-full h-2">
                        <div className={isMet ? "bg-emerald-500 h-2 rounded-full" : "bg-brand-600 h-2 rounded-full"} style={{ width: `${Math.min(100, Math.max(0, (t.progressRatio ?? 0) * 100))}%` }}></div>
                      </div>
                      <span className="text-xs text-slate-500">{Math.round((t.progressRatio ?? 0) * 100)}%</span>
                    </div>
                  </TableCell>
                  {canManageTargets && (
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => handleEditIndividual(t)}><Edit2 className="w-4 h-4 text-slate-500 hover:text-slate-700" /></Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDeleteIndividual(t.id)}><Trash2 className="w-4 h-4 text-rose-500 hover:text-rose-600" /></Button>
                    </TableCell>
                  )}
                </TableRow>
              )})}
              {allTargets.length === 0 && (
                <TableRow>
                  <TableCell colSpan={canManageTargets ? 7 : 6} className="text-center py-4 text-slate-500">No targets set for this month.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      )}

      {canManageTargets && (
        <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)}>
          <div className="mb-6">
            <h2 className="text-xl font-bold">Set Targets</h2>
            <p className="text-sm text-slate-500">Configure monthly targets for the team or individuals.</p>
          </div>

          <div className="flex gap-2 p-1 bg-slate-100 rounded-md mb-6">
            <button
              type="button"
              className={`flex-1 py-2 text-sm font-medium rounded-sm transition-colors ${targetMode === 'TEAM' ? 'bg-white shadow-sm text-brand-600' : 'text-slate-500 hover:text-slate-700'}`}
              onClick={() => setTargetMode('TEAM')}
            >
              Team Target Builder
            </button>
            <button
              type="button"
              className={`flex-1 py-2 text-sm font-medium rounded-sm transition-colors ${targetMode === 'INDIVIDUAL' ? 'bg-white shadow-sm text-brand-600' : 'text-slate-500 hover:text-slate-700'}`}
              onClick={() => setTargetMode('INDIVIDUAL')}
            >
              Individual Config
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6 max-h-[60vh] overflow-y-auto px-1 custom-scrollbar">
            {targetMode === 'TEAM' ? (
              <>
                <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                  <label className="text-sm font-medium text-slate-800">Overall Team Target (AED)</label>
                  <p className="text-xs text-slate-500 mb-2">The overarching target the Team Lead is responsible for hitting.</p>
                  <Input required type="number" step="0.01" min="0" placeholder="e.g. 400000" value={teamVal} onChange={e => setTeamVal(e.target.value)} />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-sm font-medium">Allocate to Salespersons (Optional)</label>
                    <Button type="button" variant="outline" size="sm" onClick={handleAddAllocation} className="h-8 flex items-center gap-1">
                      <Plus className="w-4 h-4" /> Add Person
                    </Button>
                  </div>
                  
                  {allocations.length === 0 && (
                    <div className="text-center py-6 border border-dashed rounded-md text-sm text-slate-500">
                      No individual allocations yet. Click &quot;Add Person&quot; to break down the target.
                    </div>
                  )}

                  <div className="space-y-3">
                    {allocations.map((alloc, i) => {
                      const availableEmployees = activeSalesEmployees.filter(
                        e => e.userId === alloc.userId || !allocations.some(a => a.userId === e.userId)
                      );
                      
                      return (
                      <div key={i} className="flex gap-2 items-center bg-white border p-2 rounded-md">
                        <div className="flex-1">
                          <Select value={alloc.userId} onChange={e => handleAllocationChange(i, 'userId', e.target.value)} required>
                            <option value="">-- Select --</option>
                            {availableEmployees.map(e => (
                              <option key={e.id} value={e.userId}>{e.firstName} {e.lastName}</option>
                            ))}
                          </Select>
                        </div>
                        <div className="w-1/3">
                          <Input required type="number" step="0.01" min="0" placeholder="Amount (AED)" value={alloc.targetValue} onChange={e => handleAllocationChange(i, 'targetValue', e.target.value)} />
                        </div>
                        <Button type="button" variant="ghost" className="text-rose-500 p-2 h-auto" onClick={() => handleRemoveAllocation(i)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    )})}
                  </div>
                </div>

                <div className="bg-brand-50 p-4 rounded-lg border border-brand-100 flex justify-between items-center">
                  <span className="text-sm font-medium text-brand-800">Lead&apos;s Unallocated Gap:</span>
                  <span className="font-bold text-lg text-brand-700">AED {unallocatedPreview.toLocaleString()}</span>
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="text-sm font-medium">Counsellor</label>
                  <Select required value={indUserId} onChange={e => setIndUserId(e.target.value)}>
                    <option value="">-- Select --</option>
                    {activeSalesEmployees.map(e => (
                      <option key={e.id} value={e.userId}>{e.firstName} {e.lastName}</option>
                    ))}
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium">Target Type</label>
                  <Select value={indType} onChange={e => setIndType(e.target.value)}>
                    <option value="CONVERSION_PERCENTAGE">Conversion Rate (%)</option>
                    <option value="REVENUE_AED">Revenue (AED)</option>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium">Target Value</label>
                  <Input required type="number" step="0.01" min="0" value={indValue} onChange={e => setIndValue(e.target.value)} />
                </div>
              </>
            )}

            <div className="flex justify-end gap-2 pt-4 border-t sticky bottom-0 bg-white">
              <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>Cancel</Button>
              <Button type="submit">Save Targets</Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
} 
