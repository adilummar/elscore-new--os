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
  const [action, setAction] = React.useState('');
  const [actorUserId, setActorUserId] = React.useState('');
  
  const [cursor, setCursor] = React.useState('');
  const [nextCursor, setNextCursor] = React.useState<string | null>(null);
  const [history, setHistory] = React.useState<string[]>([]);
  const [loading, setLoading] = React.useState(false);
  
  const load = React.useCallback(async (targetCursor: string = '') => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (entityType) params.append('entityType', entityType);
      if (action) params.append('action', action);
      if (actorUserId) params.append('actorUserId', actorUserId);
      if (targetCursor) params.append('cursor', targetCursor);
      params.append('limit', '20');

      const res: any = await getAuditAction(params.toString());
      setLogs(res.data || []);
      setNextCursor(res.meta?.nextCursor || null);
    } catch (e: any) {
      console.error(e);
      alert(e.message || 'Error loading audit logs');
    } finally {
      setLoading(false);
    }
  }, [entityType, action, actorUserId]);

  React.useEffect(() => { load(cursor); }, [load, cursor]);

  const handleNext = () => {
    if (nextCursor) {
      setHistory([...history, cursor]);
      setCursor(nextCursor);
    }
  };

  const handlePrev = () => {
    const newHistory = [...history];
    const prevCursor = newHistory.pop() || '';
    setHistory(newHistory);
    setCursor(prevCursor);
  };

  const handleSearch = () => {
    setCursor('');
    setHistory([]);
    load('');
  };

  const renderMetadata = (metadata: any) => {
    if (!metadata) return null;
    
    // Safely remove any accidental credentials if they ever snuck in (they shouldn't have)
    const safeData = { ...metadata };
    delete safeData.password;
    delete safeData.passwordHash;
    delete safeData.token;
    delete safeData.refreshToken;

    if (Object.keys(safeData).length === 0) return null;

    return (
      <div className="mt-1 p-2 bg-gray-50 rounded-md text-xs font-mono text-gray-700 whitespace-pre-wrap overflow-x-auto">
        {JSON.stringify(safeData, null, 2)}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Audit Logs</h1>
      <Card className="p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="text-sm font-medium text-gray-700">Entity Type</label>
            <Input placeholder="e.g. User, Employee" value={entityType} onChange={e => setEntityType(e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">Action</label>
            <Input placeholder="e.g. USER_CREATED" value={action} onChange={e => setAction(e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">Actor (User ID)</label>
            <Input placeholder="Filter by Actor ID" value={actorUserId} onChange={e => setActorUserId(e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end">
          <Button onClick={handleSearch} disabled={loading}>{loading ? 'Searching...' : 'Search'}</Button>
        </div>
      </Card>
      
      <Card>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Timestamp</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead>Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map(log => (
                <TableRow key={log.id}>
                  <TableCell className="whitespace-nowrap">{new Date(log.timestamp).toLocaleString()}</TableCell>
                  <TableCell>{log.actor?.email || log.actorUserId || 'System'}</TableCell>
                  <TableCell><Badge variant="info">{log.action}</Badge></TableCell>
                  <TableCell>
                    <span className="font-medium">{log.entityType}</span>
                    <br />
                    <span className="text-xs text-gray-500 font-mono">{log.entityId}</span>
                  </TableCell>
                  <TableCell className="max-w-xs">
                    {renderMetadata(log.metadata)}
                  </TableCell>
                </TableRow>
              ))}
              {logs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-gray-500">No audit logs found.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        
        <div className="flex justify-between items-center p-4 border-t">
          <Button 
            variant="outline" 
            onClick={handlePrev} 
            disabled={history.length === 0 || loading}
          >
            Previous
          </Button>
          <span className="text-sm text-gray-500">Page {history.length + 1}</span>
          <Button 
            variant="outline" 
            onClick={handleNext} 
            disabled={!nextCursor || loading}
          >
            Next
          </Button>
        </div>
      </Card>
    </div>
  );
}
