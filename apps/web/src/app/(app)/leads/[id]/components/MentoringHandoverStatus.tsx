"use client";

import * as React from 'react';
import { getMentoringHandoverAction } from '../../actions';

interface StudentHandover {
  studentId: string;
  studentBusinessId: string;
  studentName: string;
  enrollmentState: string;
  requirementCount: number;
  handover: {
    id: string;
    status: string;
    completedAt: string | null;
    missingFieldCount: number;
    lastError: string | null;
    activation: { id: string; status: string; currentStage: number } | null;
  } | null;
}

function label(value: string) {
  return value.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}

export function MentoringHandoverStatus({ leadId }: { leadId: string }) {
  const [rows, setRows] = React.useState<StudentHandover[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    async function load() {
      try {
        const res = await getMentoringHandoverAction(leadId);
        setRows(Array.isArray(res) ? res : (res?.data ?? []));
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [leadId]);

  if (loading) return <div className="text-sm text-gray-500">Loading Mentoring handover…</div>;
  if (error) return <div className="text-sm text-red-600">Could not load Mentoring handover: {error}</div>;
  if (rows.length === 0) return null;

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <h3 className="text-sm font-semibold text-gray-900 mb-3">Mentoring handover</h3>
      <ul className="divide-y divide-gray-100">
        {rows.map((row) => (
          <li key={row.studentId} className="py-2 flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="font-medium text-gray-800">
              {row.studentName} <span className="text-gray-500">({row.studentBusinessId})</span>
            </span>
            {row.handover ? (
              <span className="text-gray-600">
                {label(row.handover.activation?.status ?? row.handover.status)}
                {row.handover.activation ? ` · Stage ${row.handover.activation.currentStage}` : ''}
                {row.handover.missingFieldCount > 0 ? ` · ${row.handover.missingFieldCount} items to collect` : ''}
              </span>
            ) : (
              <span className="text-gray-500">
                {row.requirementCount === 0 ? 'Add a subject requirement to enrol' : 'Not handed over yet'}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
