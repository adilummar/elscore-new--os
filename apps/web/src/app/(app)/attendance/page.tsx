"use client";

import React, { useState, useEffect } from "react";
import { getAttendanceStatusAction, getAttendanceHistoryAction, performAttendanceAction } from "./actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";

export default function MyAttendancePage() {
  const [status, setStatus] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [toast, setToast] = useState<{message: string, type: 'success' | 'warning'} | null>(null);

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
          breakTime: `${Math.floor((data.breakDurationMinutes || 0) / 60)}h ${(data.breakDurationMinutes || 0) % 60}m`
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
      const res = await performAttendanceAction(action);
      if (!res.success) {
        showToast(res.error, 'warning');
        return;
      }
      showToast('Action successful', 'success');
      fetchStatus();
      fetchHistory();
    } catch (e) {
      console.error(e);
      showToast('An unexpected error occurred', 'warning');
    }
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
                <Button onClick={() => handleAction('CHECK_IN')}>Check In</Button>
              )}

              {status?.state === 'Working' && (
                <>
                  <Button onClick={() => handleAction('BREAK_START')} variant="secondary">Take a Break</Button>
                  <Button onClick={() => handleAction('CHECK_OUT')} variant="danger">Check Out</Button>
                </>
              )}

              {status?.state === 'On Break' && (
                <>
                  <Button onClick={() => handleAction('BREAK_END')} variant="secondary">Stop the Break</Button>
                  <Button onClick={() => handleAction('CHECK_OUT')} variant="danger">Check Out</Button>
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
    </div>
  );
}
