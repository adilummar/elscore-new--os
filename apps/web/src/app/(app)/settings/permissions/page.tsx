"use client";
import * as React from 'react';
import { getPermissionsAction } from '../actions';
import { Card } from '@/components/ui/Card';
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from '@/components/ui/Table';
import { Badge } from '@/components/ui/Badge';

export default function PermissionsPage() {
  const [permissions, setPermissions] = React.useState<any[]>([]);

  React.useEffect(() => {
    getPermissionsAction('limit=1000').then(res => setPermissions((res as any)?.data || []));
  }, []);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Permissions Catalogue</h1>
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Resource</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Delegatable</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {permissions.map(p => (
              <TableRow key={p.id}>
                <TableCell className="font-mono text-sm">{p.code}</TableCell>
                <TableCell>{p.resource}</TableCell>
                <TableCell>{p.action}</TableCell>
                <TableCell>
                  {p.isDelegatable ? <Badge variant="success">Yes</Badge> : <Badge variant="default">No</Badge>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
