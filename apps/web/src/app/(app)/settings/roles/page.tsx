"use client";
import * as React from 'react';
import { getRolesAction, createCustomRoleAction } from '../actions';
import { Card } from '@/components/ui/Card';
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from '@/components/ui/Table';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { usePermissions } from '@/components/providers/AuthProvider';

export default function RolesPage() {
  const [roles, setRoles] = React.useState<any[]>([]);
  const [isOpen, setIsOpen] = React.useState(false);
  const [formData, setFormData] = React.useState({ code: '', name: '', description: '' });
  const { hasPermission } = usePermissions();

  const load = () => getRolesAction('').then(res => setRoles((res as any)?.data || []));
  React.useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    try {
      await createCustomRoleAction(formData);
      setIsOpen(false);
      load();
    } catch (e: any) { alert(e.message); }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Roles</h1>
        {hasPermission('role.manage') && <Button onClick={() => setIsOpen(true)}>Create Custom Role</Button>}
      </div>
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {roles.map(r => (
              <TableRow key={r.id}>
                <TableCell>{r.code}</TableCell>
                <TableCell>{r.name}</TableCell>
                <TableCell>
                  {r.isSystem ? <Badge variant="info">System</Badge> : <Badge variant="default">Custom</Badge>}
                  {r.isProtected && <Badge variant="danger" className="ml-2">Protected</Badge>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Modal isOpen={isOpen} onClose={() => setIsOpen(false)}>
        <h2 className="text-xl font-bold mb-4">Create Custom Role</h2>
        <div className="space-y-4">
          <div><label className="text-sm font-medium">Code (e.g. SENIOR_SALES)</label><Input value={formData.code} onChange={e => setFormData({...formData, code: e.target.value})} /></div>
          <div><label className="text-sm font-medium">Name</label><Input value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} /></div>
          <div><label className="text-sm font-medium">Description</label><Input value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} /></div>
          <Button onClick={handleCreate} className="w-full">Create</Button>
        </div>
      </Modal>
    </div>
  );
}
