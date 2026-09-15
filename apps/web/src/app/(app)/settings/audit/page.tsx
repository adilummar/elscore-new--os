"use client";
import * as React from 'react';
import { getAuditAction } from '../actions';
import { Card } from '@/components/ui/Card';
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from '@/components/ui/Table';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

export default function AuditPage() {
  const [logs, setLogs] = React.useState<any[]>([]);
  const [entityType, setEntityType] = React.useState('');
  
  const load = async () => {
    const q = entityType ? `entityType=${entityType}` : '';
    const res = await getAuditAction(q);
    setLogs((res as any)?.data || []);
  };

  React.useEffect(() => { load(); }, []);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Audit Logs</h1>
      <div className="flex space-x-2">
        <Input placeholder="Filter by Entity Type..." value={entityType} onChange={e => setEntityType(e.target.value)} />
        <Button onClick={load}>Search</Button>
      </div>
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Timestamp</TableHead>
              <TableHead>Actor</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Entity</TableHead>
              <TableHead>Entity ID</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.map(log => (
              <TableRow key={log.id}>
                <TableCell>{new Date(log.timestamp).toLocaleString()}</TableCell>
                <TableCell>{log.actor?.email || log.actorUserId}</TableCell>
                <TableCell><Badge variant="info">{log.action}</Badge></TableCell>
                <TableCell>{log.entityType}</TableCell>
                <TableCell className="font-mono text-xs">{log.entityId}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
