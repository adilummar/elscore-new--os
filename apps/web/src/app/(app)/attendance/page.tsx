"use client";

import React, { useState, useEffect } from "react";
import { getAttendanceStatusAction, getAttendanceHistoryAction, performAttendanceAction, getDailySummaryAction } from "./actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import { Modal } from "@/components/ui/Modal";

export default function MyAttendancePage() {
  const [status, setStatus] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [note, setNote] = useState('');
  const [toast, setToast] = useState<{message: string, type: 'success' | 'warning'} | null>(null);

  const [dailySummary, setDailySummary] = useState<any>(null);
  const [isCheckInModalOpen, setIsCheckInModalOpen] = useState(false);
  const [isCheckOutModalOpen, setIsCheckOutModalOpen] = useState(false);
  const [isLoadingSummary, setIsLoadingSummary] = useState(false);

  const showToast = (message: string, type: 'success' | 'warning') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchStatus = async () => {
    try {
      const data = await getAttendanceStatusAction();
      if (data) {
        setStatus({
          state: data.status === 'ACTIVE' ? 'Working' : data.status === 'ON_BREAK' ? 'On Break' : 'Day Complete',
          workedTime: `${Math.floor((data.netDurationMinutes || 0) / 60)}h ${(data.netDurationMinutes || 0) % 60}m`,
          breakTime: `${Math.floor((data.breakDurationMinutes || 0) / 60)}h ${(data.breakDurationMinutes || 0) % 60}m`,
          note: data.note,
        });
      } else {
        setStatus(null);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchHistory = async () => {
    try {
      const data = await getAttendanceHistoryAction();
      if (Array.isArray(data)) {
        setHistory(data.map((s: any) => {
          const checkInEvent = s.events?.find((e: any) => e.eventType === 'CHECK_IN');
          const checkOutEvent = s.events?.find((e: any) => e.eventType === 'CHECK_OUT' || e.eventType === 'AUTO_CHECK_OUT');
          return {
            id: s.id,
            date: s.calendarDate,
            checkIn: checkInEvent ? new Date(checkInEvent.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-',
            checkOut: checkOutEvent ? new Date(checkOutEvent.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-',
            workedTime: `${Math.floor((s.netDurationMinutes || 0) / 60)}h ${(s.netDurationMinutes || 0) % 60}m`,
            note: s.note,
          };
        }));
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchStatus();
    fetchHistory();
  }, []);

  const handleAction = async (action: string) => {
    try {
      const res = await performAttendanceAction(action, action === 'CHECK_IN' ? note : undefined);
      if (!res.success) {
        showToast(res.error, 'warning');
        return;
      }
      showToast('Action successful', 'success');
      if (action === 'CHECK_IN') {
        setNote('');
        setIsCheckInModalOpen(false);
      }
      if (action === 'CHECK_OUT') {
        setIsCheckOutModalOpen(false);
      }
      fetchStatus();
      fetchHistory();
    } catch (e) {
      console.error(e);
      showToast('An unexpected error occurred', 'warning');
    }
  };

  const loadSummary = async () => {
    setIsLoadingSummary(true);
    try {
      const res = await getDailySummaryAction();
      setDailySummary(res || { pendingFollowUps: [], completedFollowUps: [], pendingDemos: [], completedDemos: [] });
    } catch (e) {
      console.error('Failed to load summary', e);
    } finally {
      setIsLoadingSummary(false);
    }
  };

  const handleOpenCheckIn = () => {
    loadSummary();
    setIsCheckInModalOpen(true);
  };

  const handleOpenCheckOut = () => {
    loadSummary();
    setIsCheckOutModalOpen(true);
  };

  return (
    <div className="p-4 space-y-4 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">My Attendance</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Current Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              Status: <Badge>{status?.state || 'Not Checked In'}</Badge>
            </div>
            <div className="flex flex-wrap gap-3 mt-2">
              {(!status?.state || status?.state === 'Not Checked In') && (
                <div className="w-full space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">What are you working on today? <span className="text-slate-400 font-normal">(optional)</span></label>
                    <textarea
                      value={note}
                      onChange={e => setNote(e.target.value)}
                      placeholder="e.g. Following up on leads from yesterday, Sales calls…"
                      rows={2}
                      className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                  <Button onClick={handleOpenCheckIn}>Check In</Button>
                </div>
              )}

              {/* Show current task note when already working */}
              {status?.state === 'Working' && status?.note && (
                <div className="w-full p-2.5 rounded-md bg-blue-50 border border-blue-100 text-sm text-blue-800 mb-1">
                  <span className="font-semibold text-blue-600 text-xs block mb-0.5">Working on</span>
                  {status.note}
                </div>
              )}

              {status?.state === 'Working' && (
                <>
                  <Button onClick={() => handleAction('BREAK_START')} variant="secondary">Take a Break</Button>
                  <Button onClick={handleOpenCheckOut} variant="danger">Check Out</Button>
                </>
              )}

              {status?.state === 'On Break' && (
                <>
                  <Button onClick={() => handleAction('BREAK_END')} variant="secondary">Stop the Break</Button>
                  <Button onClick={handleOpenCheckOut} variant="danger">Check Out</Button>
                </>
              )}

              {status?.state === 'Day Complete' && (
                <div className="text-sm font-medium text-emerald-600 bg-emerald-50 px-3 py-2 rounded-md">
                  You have successfully checked out for the day.
                </div>
              )}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>Today&apos;s Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div>Net Worked Time: {status?.workedTime || '0h 0m'}</div>
            <div>Break Time: {status?.breakTime || '0h 0m'}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Historical Sessions</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Check In</TableHead>
                <TableHead>Check Out</TableHead>
                <TableHead>Worked</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.map((session, i) => (
                <TableRow key={i}>
                  <TableCell>{session.date}</TableCell>
                  <TableCell>{session.checkIn}</TableCell>
                  <TableCell>{session.checkOut}</TableCell>
                  <TableCell>{session.workedTime}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {toast && (
        <div className={`fixed bottom-4 right-4 px-4 py-3 rounded-md shadow-lg font-medium text-white transition-opacity z-50 ${toast.type === 'success' ? 'bg-emerald-600' : 'bg-red-500'}`}>
          {toast.message}
        </div>
      )}

      {/* Check In Modal */}
      <Modal isOpen={isCheckInModalOpen} onClose={() => setIsCheckInModalOpen(false)} size="lg">
        <div className="space-y-6">
          <h2 className="text-xl font-bold">Good Morning! Here is your agenda for today</h2>
          
          {isLoadingSummary ? (
            <div className="py-8 text-center text-slate-500">Loading your tasks...</div>
          ) : (
            <div className="space-y-4">
              <div className="bg-amber-50 rounded-lg p-4 border border-amber-100">
                <h3 className="font-semibold text-amber-800 mb-2">Pending Follow-ups ({dailySummary?.pendingFollowUps?.length || 0})</h3>
                {dailySummary?.pendingFollowUps?.length > 0 ? (
                  <ul className="list-disc list-inside text-sm text-amber-700 space-y-1">
                    {dailySummary.pendingFollowUps.slice(0, 5).map((f: any) => (
                      <li key={f.id}>{f.lead?.firstName} {f.lead?.lastName}</li>
                    ))}
                    {dailySummary.pendingFollowUps.length > 5 && <li>...and {dailySummary.pendingFollowUps.length - 5} more</li>}
                  </ul>
                ) : (
                  <p className="text-sm text-amber-700">No pending follow-ups for today.</p>
                )}
              </div>

              <div className="bg-blue-50 rounded-lg p-4 border border-blue-100">
                <h3 className="font-semibold text-blue-800 mb-2">Scheduled Demos ({dailySummary?.pendingDemos?.length || 0})</h3>
                {dailySummary?.pendingDemos?.length > 0 ? (
                  <ul className="list-disc list-inside text-sm text-blue-700 space-y-1">
                    {dailySummary.pendingDemos.slice(0, 5).map((d: any) => (
                      <li key={d.id}>{d.student?.lead?.firstName} {d.student?.lead?.lastName}</li>
                    ))}
                    {dailySummary.pendingDemos.length > 5 && <li>...and {dailySummary.pendingDemos.length - 5} more</li>}
                  </ul>
                ) : (
                  <p className="text-sm text-blue-700">No demos scheduled for today.</p>
                )}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
            <Button variant="secondary" onClick={() => setIsCheckInModalOpen(false)}>Cancel</Button>
            <Button onClick={() => handleAction('CHECK_IN')} disabled={isLoadingSummary}>Acknowledge & Check In</Button>
          </div>
        </div>
      </Modal>

      {/* Check Out Modal */}
      <Modal isOpen={isCheckOutModalOpen} onClose={() => setIsCheckOutModalOpen(false)} size="lg">
        <div className="space-y-6">
          <h2 className="text-xl font-bold">End of Day Summary</h2>
          
          {isLoadingSummary ? (
            <div className="py-8 text-center text-slate-500">Loading your summary...</div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-emerald-50 rounded-lg p-4 border border-emerald-100">
                  <h3 className="font-semibold text-emerald-800 mb-2">Completed Today</h3>
                  <div className="text-sm text-emerald-700 space-y-1">
                    <p>✓ {dailySummary?.completedFollowUps?.length || 0} Follow-ups completed</p>
                    <p>✓ {dailySummary?.completedDemos?.length || 0} Demos conducted</p>
                  </div>
                </div>

                <div className="bg-rose-50 rounded-lg p-4 border border-rose-100">
                  <h3 className="font-semibold text-rose-800 mb-2">Leftovers / Pending</h3>
                  <div className="text-sm text-rose-700 space-y-1">
                    <p>⚠ {dailySummary?.pendingFollowUps?.length || 0} Follow-ups pending</p>
                    <p>⚠ {dailySummary?.pendingDemos?.length || 0} Demos pending</p>
                  </div>
                </div>
              </div>

              {(dailySummary?.pendingFollowUps?.length > 0 || dailySummary?.pendingDemos?.length > 0) && (
                <div className="p-3 bg-slate-50 text-slate-600 text-sm rounded border border-slate-200">
                  You still have pending tasks for today. Are you sure you want to check out?
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
            <Button variant="secondary" onClick={() => setIsCheckOutModalOpen(false)}>Cancel</Button>
            <Button onClick={() => handleAction('CHECK_OUT')} variant="danger" disabled={isLoadingSummary}>Verify & Check Out</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
