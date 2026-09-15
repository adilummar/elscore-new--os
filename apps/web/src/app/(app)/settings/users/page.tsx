"use client";
import * as React from 'react';
import { getUsersAction, createUserAction, updateUserStatusAction, getDepartmentsAction, getRolesAction, assignRoleAction } from '../actions';
import { Card } from '@/components/ui/Card';
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from '@/components/ui/Table';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { usePermissions } from '@/components/providers/AuthProvider';

export default function UsersPage() {
  const [users, setUsers] = React.useState<any[]>([]);
  const [departments, setDepartments] = React.useState<any[]>([]);
  const [roles, setRoles] = React.useState<any[]>([]);
  const [isOpen, setIsOpen] = React.useState(false);
  const [formData, setFormData] = React.useState({ email: '', password: '', firstName: '', lastName: '', departmentId: '', roleId: '' });
  const { hasPermission } = usePermissions();

  const loadData = async () => {
    const res = await getUsersAction('');
    setUsers((res as any)?.data || []);
    const [deps, rls] = await Promise.all([getDepartmentsAction(), getRolesAction('limit=100')]);
    setDepartments((deps as any)?.data || []);
    setRoles((rls as any)?.data || []);
  };

  React.useEffect(() => { loadData(); }, []);

  const handleCreate = async () => {
    try {
      await createUserAction(formData);
      setIsOpen(false);
      loadData();
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleStatus = async (id: string, status: string) => {
    try {
      await updateUserStatusAction(id, status);
      loadData();
    } catch (e: any) {
      alert(e.message);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Users</h1>
        {hasPermission('user.create') && <Button onClick={() => setIsOpen(true)}>Create User</Button>}
      </div>
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Employee</TableHead>
              <TableHead>Roles</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map(u => (
              <TableRow key={u.id}>
                <TableCell>{u.email}</TableCell>
                <TableCell><StatusBadge status={u.status} /></TableCell>
                <TableCell>{u.employee?.firstName} {u.employee?.lastName}</TableCell>
                <TableCell>{u.userRoles?.map((ur: any) => ur.role.code).join(', ')}</TableCell>
                <TableCell>
                  {hasPermission('user.update') && u.status === 'ACTIVE' && (
                    <Button variant="danger" size="sm" onClick={() => handleStatus(u.id, 'SUSPENDED')}>Suspend</Button>
                  )}
                  {hasPermission('user.update') && u.status === 'SUSPENDED' && (
                    <Button variant="primary" size="sm" onClick={() => handleStatus(u.id, 'ACTIVE')}>Activate</Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
      
      <Modal isOpen={isOpen} onClose={() => setIsOpen(false)}>
        <h2 className="text-xl font-bold mb-4">Create User</h2>
        <div className="space-y-4">
          <div><label className="text-sm font-medium">Email</label><Input value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} /></div>
          <div><label className="text-sm font-medium">Password</label><Input type="password" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} /></div>
          <div><label className="text-sm font-medium">First Name</label><Input value={formData.firstName} onChange={e => setFormData({...formData, firstName: e.target.value})} /></div>
          <div><label className="text-sm font-medium">Last Name</label><Input value={formData.lastName} onChange={e => setFormData({...formData, lastName: e.target.value})} /></div>
          <div>
            <label className="text-sm font-medium">Department</label>
            <Select value={formData.departmentId} onChange={e => {
              setFormData({...formData, departmentId: e.target.value, roleId: ''});
            }}>
              <option value="">Select...</option>
              {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium">Role</label>
            <Select value={formData.roleId} onChange={e => setFormData({...formData, roleId: e.target.value})} disabled={!formData.departmentId}>
              <option value="">Select...</option>
              {roles.filter(r => {
                if (!formData.departmentId) return true;
                const dep = departments.find(d => d.id === formData.departmentId);
                if (!dep) return true;
                
                const roleMapping: Record<string, string[]> = {
                  'ADMINISTRATION': ['CEO', 'CO_FOUNDER', 'OPERATIONS_MANAGER'],
                  'MARKETING': ['MARKETING_HEAD', 'PERFORMANCE_MARKETER', 'DESIGNER'],
                  'SALES': ['SALES_HEAD', 'SALES_COUNSELLOR'],
                  'ACADEMICS': ['ACADEMIC_HEAD', 'MENTOR', 'DEMO_COORDINATOR', 'TUTOR'],
                  'FINANCE': ['FINANCE_HEAD', 'FINANCE_MANAGER', 'FINANCE_EXECUTIVE', 'ACCOUNTANT'],
                  'HR': ['HR_MANAGER', 'HR_EXECUTIVE', 'HR_ASSISTANT']
                };
                
                const allowedRoles = roleMapping[dep.code] || [];
                return allowedRoles.includes(r.code);
              }).map(r => <option key={r.id} value={r.id}>{r.name || r.code}</option>)}
            </Select>
          </div>
          <Button onClick={handleCreate} className="w-full">Create</Button>
        </div>
      </Modal>
    </div>
  );
}
