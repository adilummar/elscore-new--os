"use client";
import * as React from 'react';
import { getUsersAction, getPermissionsAction, delegatePermissionAction, revokeDelegationAction } from '../actions';
import { Card } from '@/components/ui/Card';
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from '@/components/ui/Table';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Modal } from '@/components/ui/Modal';
import { usePermissions } from '@/components/providers/AuthProvider';

export default function DelegationsPage() {
  const [users, setUsers] = React.useState<any[]>([]);
  const [permissions, setPermissions] = React.useState<any[]>([]);
  const [isOpen, setIsOpen] = React.useState(false);
  const [selectedUserId, setSelectedUserId] = React.useState('');
  const [selectedPermissionId, setSelectedPermissionId] = React.useState('');
  const [loading, setLoading] = React.useState(false);

  const { hasPermission } = usePermissions();

  const load = async () => {
    try {
      const uRes = await getUsersAction('limit=100');
      const pRes = await getPermissionsAction('limit=1000');
      setUsers((uRes as any)?.data || []);
      setPermissions((pRes as any)?.data || []);
    } catch (e) {
      console.error(e);
    }
  };

  React.useEffect(() => { load(); }, []);

  const handleDelegate = async () => {
    if (!selectedUserId || !selectedPermissionId) return alert('Select user and permission');
    setLoading(true);
    try {
      await delegatePermissionAction(selectedUserId, selectedPermissionId);
      setIsOpen(false);
      setSelectedUserId('');
      setSelectedPermissionId('');
      load();
    } catch (e: any) {
      alert(e.message || 'Error delegating permission');
    } finally {
      setLoading(false);
    }
  };

  const handleRevoke = async (userId: string, grantId: string) => {
    if (!window.confirm('Revoke this delegation?')) return;
    try {
      await revokeDelegationAction(userId, grantId);
      load();
    } catch (e: any) {
      alert(e.message || 'Error revoking delegation');
    }
  };

  // Only users who are HR_ASSISTANT or HR_EXECUTIVE can receive delegations
  const eligibleUsers = users.filter(u => 
    u.userRoles?.some((ur: any) => ur.role.code === 'HR_ASSISTANT' || ur.role.code === 'HR_EXECUTIVE')
  );

  const delegatablePermissions = permissions.filter(p => p.isDelegatable);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Delegations</h1>
        {hasPermission('role.manage') && <Button onClick={() => setIsOpen(true)}>Delegate Duty</Button>}
      </div>
      
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Delegate User</TableHead>
              <TableHead>Permission Code</TableHead>
              <TableHead>Delegated By</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.flatMap(u => 
              (u.userPermissions || []).filter((up: any) => !up.revokedAt).map((up: any) => (
                <TableRow key={up.id}>
                  <TableCell>{u.email}</TableCell>
                  <TableCell>{up.permission?.code}</TableCell>
                  <TableCell>{up.delegatedByUserId}</TableCell>
                  <TableCell>
                    {hasPermission('role.manage') && (
                      <Button variant="danger" size="sm" onClick={() => handleRevoke(u.id, up.id)}>Revoke</Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
            {users.flatMap(u => (u.userPermissions || []).filter((up: any) => !up.revokedAt)).length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-4 text-gray-500">No active delegations found.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      <Modal isOpen={isOpen} onClose={() => setIsOpen(false)}>
        <h2 className="text-xl font-bold mb-4">Delegate Duty</h2>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">Delegate (HR Assistant/Executive)</label>
            <Select value={selectedUserId} onChange={e => setSelectedUserId(e.target.value)}>
              <option value="">Select User...</option>
              {eligibleUsers.map(u => <option key={u.id} value={u.id}>{u.email}</option>)}
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium">Duty / Permission</label>
            <Select value={selectedPermissionId} onChange={e => setSelectedPermissionId(e.target.value)}>
              <option value="">Select Delegatable Permission...</option>
              {delegatablePermissions.map(p => <option key={p.id} value={p.id}>{p.code}</option>)}
            </Select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={handleDelegate} disabled={loading || !selectedUserId || !selectedPermissionId}>
              {loading ? 'Saving...' : 'Confirm Delegation'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
