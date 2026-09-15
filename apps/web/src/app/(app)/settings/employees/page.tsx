"use client";
import * as React from 'react';
import { getEmployeesAction } from '../actions';
import { Card } from '@/components/ui/Card';
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from '@/components/ui/Table';
import { StatusBadge } from '@/components/ui/StatusBadge';

export default function EmployeesPage() {
  const [employees, setEmployees] = React.useState<any[]>([]);

  React.useEffect(() => {
    getEmployeesAction('').then(res => setEmployees((res as any)?.data || []));
  }, []);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Employees</h1>
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Department</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {employees.map(e => (
              <TableRow key={e.id}>
                <TableCell>{e.businessId}</TableCell>
                <TableCell>{e.firstName} {e.lastName}</TableCell>
                <TableCell>{e.departmentId}</TableCell>
                <TableCell><StatusBadge status={e.employmentStatus} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
