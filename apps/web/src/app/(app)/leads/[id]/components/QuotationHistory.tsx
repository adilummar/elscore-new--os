"use client";

import * as React from 'react';
import { Button } from '@/components/ui/Button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import { usePermissions } from '@/components/providers/AuthProvider';
import { getStudentQuotationsAction } from '../../actions';
import { Download } from 'lucide-react';

export function QuotationHistory({
  studentId,
  studentName,
  refreshKey = 0,
}: {
  studentId: string;
  studentName?: string;
  refreshKey?: number;
}) {
  const { hasPermission } = usePermissions();
  const [quotations, setQuotations] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const fetchQuotations = React.useCallback(async () => {
    try {
      setLoading(true);
      const data = await getStudentQuotationsAction(studentId);
      setQuotations(Array.isArray(data) ? data : []);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch quotations');
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  React.useEffect(() => {
    fetchQuotations();
  }, [fetchQuotations, refreshKey]);

  if (!hasPermission('quotation.read')) {
    return null;
  }

  if (loading) return <div className="text-sm text-slate-500 py-4 animate-pulse">Loading quotation history...</div>;
  if (error) return <div className="text-sm text-red-500 py-4">{error}</div>;
  if (quotations.length === 0) return null;

  return (
    <div className="mt-6 border-t border-slate-100 pt-4">
      <h4 className="text-sm font-semibold text-slate-900 mb-3">Quotation History</h4>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Quotation #</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Student</TableHead>
              <TableHead>Amount Due</TableHead>
              <TableHead>Created By</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {quotations.map((q: any) => (
              <TableRow key={q.id}>
                <TableCell className="font-medium text-slate-700">{q.quotationNumber}</TableCell>
                <TableCell className="text-sm text-slate-600">
                  {new Date(q.quotationDate).toLocaleDateString()}
                </TableCell>
                <TableCell className="text-sm text-slate-600">{q.studentName || studentName || '—'}</TableCell>
                <TableCell className="font-medium text-brand-600">
                  {q.currency} {q.totalAmountDue}
                </TableCell>
                <TableCell className="text-sm">{q.creator?.email || q.createdBy}</TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 flex items-center gap-1"
                    onClick={() => {
                      window.open(`/api/quotations/${q.id}/pdf`, '_blank');
                    }}
                  >
                    <Download className="w-4 h-4" /> PDF
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
