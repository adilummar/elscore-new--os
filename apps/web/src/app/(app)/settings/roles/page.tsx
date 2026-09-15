"use client";
import * as React from 'react';
import { getRolesAction, createCustomRoleAction, getPermissionsAction, updateRolePermissionAction } from '../actions';
import { Card } from '@/components/ui/Card';
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from '@/components/ui/Table';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { usePermissions } from '@/components/providers/AuthProvider';

export default function RolesPage() {
  const [roles, setRoles] = React.useState<any[]>([]);
  const [allPermissions, setAllPermissions] = React.useState<any[]>([]);
  const [isOpen, setIsOpen] = React.useState(false);
  const [formData, setFormData] = React.useState({ code: '', name: '', description: '' });
  
  const [editingRole, setEditingRole] = React.useState<any>(null);
  const [selectedPermissionIds, setSelectedPermissionIds] = React.useState<Set<string>>(new Set());
  const [originalPermissionIds, setOriginalPermissionIds] = React.useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = React.useState('');
  const [isSaving, setIsSaving] = React.useState(false);

  const { hasPermission } = usePermissions();

  const load = () => {
    getRolesAction('').then(res => setRoles((res as any)?.data || []));
    getPermissionsAction('limit=1000').then(res => setAllPermissions((res as any)?.data || []));
  };
  React.useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    try {
      await createCustomRoleAction(formData);
      setIsOpen(false);
      setFormData({ code: '', name: '', description: '' });
      load();
    } catch (e: any) { alert(e.message); }
  };

  const openEditRole = (role: any) => {
    setEditingRole(role);
    const pIds = new Set<string>((role.permissions || []).map((p: any) => p.permissionId));
    setSelectedPermissionIds(pIds);
    setOriginalPermissionIds(new Set(pIds));
    setSearchQuery('');
  };

  const hasUnsavedChanges = () => {
    if (selectedPermissionIds.size !== originalPermissionIds.size) return true;
    for (let id of selectedPermissionIds) {
      if (!originalPermissionIds.has(id)) return true;
    }
    return false;
  };

  const handleCloseEdit = () => {
    if (hasUnsavedChanges()) {
      if (!window.confirm('You have unsaved changes. Are you sure you want to close without saving?')) {
        return;
      }
    }
    setEditingRole(null);
  };

  const handleSavePermissions = async () => {
    if (!editingRole) return;
    setIsSaving(true);
    try {
      const toAdd = [...selectedPermissionIds].filter(id => !originalPermissionIds.has(id));
      const toRemove = [...originalPermissionIds].filter(id => !selectedPermissionIds.has(id));

      for (let pId of toAdd) {
        await updateRolePermissionAction(editingRole.id, 'ADD', pId);
      }
      for (let pId of toRemove) {
        await updateRolePermissionAction(editingRole.id, 'REMOVE', pId);
      }
      alert('Role permissions updated successfully!');
      setEditingRole(null);
      load();
    } catch (e: any) {
      alert(e.message || 'Error updating permissions');
    } finally {
      setIsSaving(false);
    }
  };

  const togglePermission = (id: string) => {
    const newSet = new Set(selectedPermissionIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedPermissionIds(newSet);
  };

  const filteredPermissions = allPermissions.filter(p => 
    p.code.toLowerCase().includes(searchQuery.toLowerCase()) || 
    (p.description && p.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  // Group permissions by prefix (e.g. "user.read" -> "user")
  const groupedPermissions: Record<string, any[]> = {};
  filteredPermissions.forEach(p => {
    const group = p.code.split('.')[0];
    if (!groupedPermissions[group]) groupedPermissions[group] = [];
    groupedPermissions[group].push(p);
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Roles</h1>
        {hasPermission('role.manage') && <Button onClick={() => setIsOpen(true)}>Create Custom Role</Button>}
      </div>
      <Card>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Permissions</TableHead>
                <TableHead>Actions</TableHead>
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
                  <TableCell>{r.permissions?.length || 0} permissions</TableCell>
                  <TableCell>
                    {hasPermission('role.manage') && (
                      <Button 
                        size="sm" 
                        variant="outline" 
                        onClick={() => openEditRole(r)}
                        disabled={r.isProtected}
                        title={r.isProtected ? "Protected roles cannot be modified" : "Edit permissions"}
                      >
                        {r.isProtected ? 'Protected' : 'Edit'}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
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

      <Modal isOpen={!!editingRole} onClose={handleCloseEdit}>
        <div className="flex flex-col h-[80vh]">
          <h2 className="text-xl font-bold mb-2">Edit Role: {editingRole?.name || editingRole?.code}</h2>
          <p className="text-sm text-gray-500 mb-4">{selectedPermissionIds.size} permissions selected</p>
          
          <div className="mb-4">
            <Input 
              placeholder="Search permissions..." 
              value={searchQuery} 
              onChange={e => setSearchQuery(e.target.value)} 
            />
          </div>

          <div className="flex-1 overflow-y-auto pr-2 space-y-6">
            {Object.keys(groupedPermissions).sort().map(group => (
              <div key={group}>
                <h3 className="font-bold text-sm text-gray-700 capitalize mb-2 border-b pb-1">{group}</h3>
                <div className="grid grid-cols-1 gap-2">
                  {groupedPermissions[group].map(p => (
                    <label key={p.id} className="flex items-start space-x-3 p-2 hover:bg-gray-50 rounded-md cursor-pointer border border-transparent hover:border-gray-200 transition-colors">
                      <input 
                        type="checkbox"
                        checked={selectedPermissionIds.has(p.id)}
                        onChange={() => togglePermission(p.id)}
                        className="mt-1"
                      />
                      <div>
                        <div className="font-medium text-sm">{p.code}</div>
                        {p.description && <div className="text-xs text-gray-500">{p.description}</div>}
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            ))}
            {filteredPermissions.length === 0 && (
              <div className="text-center py-8 text-gray-500">No permissions found matching search.</div>
            )}
          </div>

          <div className="pt-4 mt-4 border-t flex justify-end gap-2">
            <Button variant="outline" onClick={handleCloseEdit}>Cancel</Button>
            <Button 
              variant="primary" 
              onClick={handleSavePermissions} 
              disabled={!hasUnsavedChanges() || isSaving}
            >
              {isSaving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
