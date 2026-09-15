"use client";
import * as React from 'react';
import { getEmployeesAction, updateEmployeeStatusAction } from '../actions';
import { Card } from '@/components/ui/Card';
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from '@/components/ui/Table';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { usePermissions } from '@/components/providers/AuthProvider';

export default function EmployeesPage() {
  const [employees, setEmployees] = React.useState<any[]>([]);
  const { hasPermission } = usePermissions();

  const [isTerminateOpen, setIsTerminateOpen] = React.useState(false);
  const [isRehireOpen, setIsRehireOpen] = React.useState(false);
  const [selectedEmp, setSelectedEmp] = React.useState<any>(null);
  const [reason, setReason] = React.useState('');
  const [loading, setLoading] = React.useState(false);

  const loadData = async () => {
    try {
      const res = await getEmployeesAction('');
      setEmployees((res as any)?.data || []);
    } catch (e) {
      console.error(e);
    }
  };

  React.useEffect(() => {
    loadData();
  }, []);

  const handleTerminate = async () => {
    if (!reason) return alert('Reason is mandatory for termination');
    setLoading(true);
    try {
      await updateEmployeeStatusAction(selectedEmp.id, 'TERMINATED', reason);
      setIsTerminateOpen(false);
      loadData();
    } catch (e: any) {
      alert(e.message || 'Error terminating employee');
    } finally {
      setLoading(false);
    }
  };

  const handleRehire = async () => {
    if (!reason) return alert('Reason is mandatory for rehire');
    setLoading(true);
    try {
      await updateEmployeeStatusAction(selectedEmp.id, 'ACTIVE', reason);
      setIsRehireOpen(false);
      loadData();
      alert('Employee rehired successfully. Note: Previous roles are NOT automatically restored. Please assign appropriate roles via Users page.');
    } catch (e: any) {
      alert(e.message || 'Error rehiring employee');
    } finally {
      setLoading(false);
    }
  };

  const openTerminate = (emp: any) => {
    setSelectedEmp(emp);
    setReason('');
    setIsTerminateOpen(true);
  };

  const openRehire = (emp: any) => {
    setSelectedEmp(emp);
    setReason('');
    setIsRehireOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Employees</h1>
      </div>
      <Card>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {employees.map(e => (
                <TableRow key={e.id}>
                  <TableCell>{e.businessId}</TableCell>
                  <TableCell>{e.firstName} {e.lastName}</TableCell>
                  <TableCell>{e.departmentId}</TableCell>
                  <TableCell><StatusBadge status={e.employmentStatus} /></TableCell>
                  <TableCell>
                    {hasPermission('employee.update') && e.employmentStatus === 'ACTIVE' && (
                      <Button variant="danger" size="sm" onClick={() => openTerminate(e)}>Terminate</Button>
                    )}
                    {hasPermission('employee.update') && e.employmentStatus === 'TERMINATED' && (
                      <Button variant="primary" size="sm" onClick={() => openRehire(e)}>Rehire existing employee</Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Modal isOpen={isTerminateOpen} onClose={() => setIsTerminateOpen(false)}>
        <h2 className="text-xl font-bold mb-4 text-red-600">Terminate Employee</h2>
        <div className="space-y-4">
          <p className="text-sm text-gray-700">
            You are about to terminate <strong>{selectedEmp?.firstName} {selectedEmp?.lastName}</strong>.
            This will mark the employee as TERMINATED, deactivate their user account, revoke their tokens, and revoke permissions.
          </p>
          <div>
            <label className="text-sm font-medium">Reason (Mandatory) *</label>
            <Input 
              value={reason} 
              onChange={e => setReason(e.target.value)} 
              placeholder="Provide reason for termination"
              required 
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setIsTerminateOpen(false)}>Cancel</Button>
            <Button variant="danger" onClick={handleTerminate} disabled={loading || !reason}>
              {loading ? 'Terminating...' : 'Confirm Termination'}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={isRehireOpen} onClose={() => setIsRehireOpen(false)}>
        <h2 className="text-xl font-bold mb-4 text-blue-600">Rehire Employee</h2>
        <div className="space-y-4">
          <p className="text-sm text-gray-700">
            You are rehiring <strong>{selectedEmp?.firstName} {selectedEmp?.lastName}</strong>. 
            This will reactivate their employee record. Previous roles are NOT automatically restored.
          </p>
          <div>
            <label className="text-sm font-medium">Reason (Mandatory) *</label>
            <Input 
              value={reason} 
              onChange={e => setReason(e.target.value)} 
              placeholder="Provide reason for rehire"
              required 
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setIsRehireOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={handleRehire} disabled={loading || !reason}>
              {loading ? 'Rehiring...' : 'Confirm Rehire'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
