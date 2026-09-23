'use client';
import { useState, useEffect } from 'react';
import { getLeadAssignmentHistoryAction } from '../../actions';

export function LeadDistributionHistory({ leadId }: { leadId: string }) {
  const [cursor, setCursor] = useState<string | null>(null);

  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<boolean>(false);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setError(false);
    getLeadAssignmentHistoryAction(leadId)
      .then(res => {
        if (active) {
          setData(res);
          setIsLoading(false);
        }
      })
      .catch(err => {
        if (active) {
          setError(true);
          setIsLoading(false);
        }
      });
    return () => { active = false; };
  }, [leadId, cursor]);

  if (isLoading) return <div className="text-gray-500 py-4 text-center">Loading assignment history...</div>;
  if (error) return <div className="text-red-500 py-4 text-center">Failed to load assignment history</div>;

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-medium text-gray-900">Assignment History</h3>
      {(!data?.data || data.data.length === 0) ? (
        <p className="text-gray-500 text-sm">No assignment history found for this lead.</p>
      ) : (
        <div className="bg-white shadow overflow-hidden sm:rounded-md border border-gray-200">
          <ul role="list" className="divide-y divide-gray-200">
            {data.data.map((event: any) => (
              <li key={event.id} className="px-4 py-4 sm:px-6">
                <div className="flex justify-between">
                  <div className="flex flex-col">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      Assigned to: {event.newOwner ? `${event.newOwner.employee.firstName} ${event.newOwner.employee.lastName}` : 'Unassigned'}
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <span className="inline-flex items-center rounded-md bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600">
                        {event.assignmentMethod}
                      </span>
                      {event.isReassignment && (
                        <span className="inline-flex items-center rounded-md bg-yellow-50 px-2 py-1 text-xs font-medium text-yellow-800 border border-yellow-200">
                          Reassignment
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-end">
                    <div className="text-sm text-gray-500">
                      {new Date(event.assignedAt).toLocaleTimeString()}
                    </div>
                    {event.assignmentLatencyMs !== null && (
                      <div className="mt-1 flex items-center text-sm text-gray-500">
                        Latency: {event.assignmentLatencyMs}ms
                      </div>
                    )}
                    <div className="mt-1 text-xs text-gray-400">
                      Daily Order: #{event.dailyDistributionOrder}
                    </div>
                  </div>
                </div>
                {event.assignmentMethod === 'ROUND_ROBIN' && (
                  <div className="mt-3 bg-gray-50 p-2 rounded text-xs text-gray-500 font-mono flex flex-wrap gap-4 border border-gray-100">
                    <span>Sequence: {event.rrSequence}</span>
                    <span>Position: {event.rrPosition}</span>
                    <span>Pool: {event.eligibleMemberIds?.length || 0} members</span>
                  </div>
                )}
              </li>
            ))}
          </ul>
          {data.pagination?.hasNextPage && (
            <div className="bg-gray-50 px-4 py-3 border-t border-gray-200 sm:px-6 flex justify-center">
              <button
                onClick={() => setCursor(data.pagination.nextCursor)}
                className="text-sm font-medium text-blue-600 hover:text-blue-500"
              >
                Load More
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
