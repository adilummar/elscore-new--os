"use client";
import * as React from 'react';
import { getSubjectsAction, getGradesAction, getCurriculaAction, createSubjectAction, createGradeAction, createCurriculumAction, updateSubjectStatusAction, updateGradeStatusAction, updateCurriculumStatusAction } from '../actions';
import { Card } from '@/components/ui/Card';
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from '@/components/ui/Table';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';

export default function ReferenceDataPage() {
  const [activeTab, setActiveTab] = React.useState('subjects');
  const [data, setData] = React.useState<any[]>([]);
  const [isOpen, setIsOpen] = React.useState(false);
  const [form, setForm] = React.useState({ code: '', name: '', sortOrder: '0' });

  const load = async () => {
    let res;
    if (activeTab === 'subjects') res = await getSubjectsAction();
    if (activeTab === 'grades') res = await getGradesAction();
    if (activeTab === 'curricula') res = await getCurriculaAction();
    setData((res as any)?.data || []);
  };

  React.useEffect(() => { load(); }, [activeTab]);

  const handleCreate = async () => {
    try {
      const payload: any = { code: form.code, name: form.name };
      if (activeTab === 'grades') payload.sortOrder = parseInt(form.sortOrder, 10);
      
      if (activeTab === 'subjects') await createSubjectAction(payload);
      if (activeTab === 'grades') await createGradeAction(payload);
      if (activeTab === 'curricula') await createCurriculumAction(payload);
      
      setIsOpen(false);
      load();
    } catch (e: any) { alert(e.message); }
  };

  const handleStatus = async (id: string, current: boolean) => {
    try {
      if (activeTab === 'subjects') await updateSubjectStatusAction(id, !current);
      if (activeTab === 'grades') await updateGradeStatusAction(id, !current);
      if (activeTab === 'curricula') await updateCurriculumStatusAction(id, !current);
      load();
    } catch (e: any) { alert(e.message); }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Reference Data</h1>
        <Button onClick={() => setIsOpen(true)}>Create {activeTab.slice(0, -1)}</Button>
      </div>
      
      <div className="flex space-x-4 border-b border-gray-200">
        <button className={`py-2 px-4 ${activeTab === 'subjects' ? 'border-b-2 border-brand-500 font-bold' : ''}`} onClick={() => setActiveTab('subjects')}>Subjects</button>
        <button className={`py-2 px-4 ${activeTab === 'grades' ? 'border-b-2 border-brand-500 font-bold' : ''}`} onClick={() => setActiveTab('grades')}>Grades</button>
        <button className={`py-2 px-4 ${activeTab === 'curricula' ? 'border-b-2 border-brand-500 font-bold' : ''}`} onClick={() => setActiveTab('curricula')}>Curricula</button>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map(item => (
              <TableRow key={item.id}>
                <TableCell>{item.code}</TableCell>
                <TableCell>{item.name}</TableCell>
                <TableCell><StatusBadge status={item.isActive ? 'ACTIVE' : 'INACTIVE'} /></TableCell>
                <TableCell>
                  <Button variant="outline" size="sm" onClick={() => handleStatus(item.id, item.isActive)}>
                    {item.isActive ? 'Deactivate' : 'Activate'}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Modal isOpen={isOpen} onClose={() => setIsOpen(false)}>
        <h2 className="text-xl font-bold mb-4">Create {activeTab}</h2>
        <div className="space-y-4">
          <div><label className="text-sm font-medium">Code</label><Input value={form.code} onChange={e => setForm({...form, code: e.target.value})} /></div>
          <div><label className="text-sm font-medium">Name</label><Input value={form.name} onChange={e => setForm({...form, name: e.target.value})} /></div>
          {activeTab === 'grades' && <div><label className="text-sm font-medium">Sort Order</label><Input type="number" value={form.sortOrder} onChange={e => setForm({...form, sortOrder: e.target.value})} /></div>}
          <Button onClick={handleCreate} className="w-full">Create</Button>
        </div>
      </Modal>
    </div>
  );
}
