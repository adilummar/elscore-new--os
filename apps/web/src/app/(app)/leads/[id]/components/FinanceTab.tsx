"use client";

import * as React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import { usePermissions } from '@/components/providers/AuthProvider';

export function FinanceTab({ lead }: { lead: any }) {
  const { hasPermission } = usePermissions();
  const invoices = lead?.invoices || [];

  if (!hasPermission('finance.invoice.read')) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-slate-500">
          You do not have permission to view financial details.
        </CardContent>
      </Card>
    );
  }

  if (invoices.length === 0) {
    return (
      <Card>
        <CardHeader><CardTitle>Finance Details</CardTitle></CardHeader>
        <CardContent>
          <div className="text-slate-500 italic p-4 text-center">No invoices or financial records found for this lead.</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {invoices.map((invoice: any) => (
        <Card key={invoice.id} className="shadow-sm border-slate-200">
          <CardHeader className="bg-slate-50/50 border-b border-slate-100 pb-4">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  Invoice {invoice.businessId}
                  <Badge variant={
                    invoice.status === 'PAID' ? 'success' : 
                    invoice.status === 'PARTIALLY_PAID' ? 'warning' : 
                    invoice.status === 'VOIDED' ? 'danger' : 'default'
                  }>
                    {invoice.status}
                  </Badge>
                </CardTitle>
                <div className="text-sm text-slate-500 mt-1">
                  Student: <span className="font-medium text-slate-700">{invoice.student?.firstName} {invoice.student?.lastName}</span>
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm text-slate-500">Outstanding Balance</div>
                <div className="text-xl font-bold text-slate-900">AED {Number(invoice.outstanding).toFixed(2)}</div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
              <div>
                <div className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Total Amount</div>
                <div className="text-lg font-semibold">AED {Number(invoice.total).toFixed(2)}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Amount Paid</div>
                <div className="text-lg font-semibold text-emerald-600">AED {Number(invoice.amountPaid).toFixed(2)}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Discount</div>
                <div className="text-lg font-semibold text-slate-700">AED {Number(invoice.discountAmount).toFixed(2)}</div>
              </div>
            </div>

            {invoice.payments?.length > 0 && (
              <div className="mt-6">
                <h4 className="text-sm font-semibold text-slate-900 mb-3 border-b pb-2">Recent Payments</h4>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Receipt #</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Method</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {invoice.payments.map((payment: any) => (
                        <TableRow key={payment.id}>
                          <TableCell className="font-medium text-slate-700">{payment.receipt?.businessId || '--'}</TableCell>
                          <TableCell className="text-sm text-slate-600">{new Date(payment.receivedAt).toLocaleDateString()}</TableCell>
                          <TableCell>
                            <Badge variant="info" className="text-xs">{payment.method}</Badge>
                          </TableCell>
                          <TableCell className="text-right font-medium text-emerald-600">AED {Number(payment.amount).toFixed(2)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
            
            {invoice.payments?.length === 0 && (
              <div className="mt-4 text-sm text-slate-500 italic">No successful payments recorded yet.</div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
