"use client";

import React, { useState, useEffect } from "react";
import { getTeamAttendanceAction, correctAttendanceEventAction } from "../actions";
import { fmtTime, fmtDateTime, BUSINESS_TIMEZONE } from "@/lib/time";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import { Input } from "@/components/ui/Input";

export default function AttendanceManagementPage() {
  const [date, setDate] = useState<string>(new Date().toLocaleDateString('en-CA', { timeZone: BUSINESS_TIMEZONE })); // IST today
  const [teamData, setTeamData] = useState<any[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [newTimestamp, setNewTimestamp] = useState<string>("");
  const [reason, setReason] = useState<string>("");

  const fetchTeamAttendance = async () => {
    try {
      const data = await getTeamAttendanceAction(date);
      setTeamData(data);
    } catch (e) {
      console.error(e);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    fetchTeamAttendance();
  }, [date]);

  const handleCorrectTimestamp = async () => {
    if (!selectedEventId || !selectedSessionId || !newTimestamp) return;
    try {
      // newTimestamp from datetime-local input is "YYYY-MM-DDTHH:mm" — treated as IST.
      // We append the IST offset so the server stores the correct UTC value.
      const istIsoString = `${newTimestamp}:00+05:30`;
      await correctAttendanceEventAction(selectedEventId, selectedSessionId, istIsoString, reason);
      setSelectedEventId(null);
      setSelectedSessionId(null);
      setReason("");
      fetchTeamAttendance();
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="p-4 space-y-4 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Team Attendance Management</h1>
      
      <div className="flex items-center space-x-2 mb-4">
        <label className="font-medium">Select Date:</label>
        <input 
          type="date" 
          value={date} 
          onChange={(e) => setDate(e.target.value)}
          className="border rounded p-2"
        />
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Check In (IST)</TableHead>
                <TableHead>Check Out (IST)</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {teamData.map((record) => {
                const checkInEvt  = record.events?.find((e: any) => e.eventType === 'CHECK_IN');
                const checkOutEvt = record.events?.find((e: any) => e.eventType === 'CHECK_OUT' || e.eventType === 'AUTO_CHECK_OUT');
                const employeeName = record.employee
                  ? `${record.employee.firstName ?? ''} ${record.employee.lastName ?? ''}`.trim()
                  : record.employeeName ?? '-';
                return (
                  <TableRow key={record.id}>
                    <TableCell>{employeeName}</TableCell>
                    <TableCell>{record.status}</TableCell>
                    <TableCell className="font-mono text-sm">{fmtTime(checkInEvt?.timestamp)}</TableCell>
                    <TableCell className="font-mono text-sm">{fmtTime(checkOutEvt?.timestamp)}</TableCell>
                    <TableCell>
                      <Button variant="outline" size="sm" onClick={() => { setSelectedEventId(checkInEvt?.id ?? null); setSelectedSessionId(record.id); }}>Correct Time</Button>
                    </TableCell>
                  </TableRow>
                );
              })}
              {teamData.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-slate-400">No attendance records for this date.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {selectedEventId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>Correct Timestamp</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-slate-500">Enter the correct time in <strong>IST (India Standard Time)</strong>. The system will save it correctly regardless of your device timezone.</p>
              <div>
                <label className="block mb-1 text-sm font-medium">New Time (IST):</label>
                <input 
                  type="datetime-local" 
                  value={newTimestamp}
                  onChange={(e) => setNewTimestamp(e.target.value)}
                  className="w-full border rounded p-2 text-sm"
                />
              </div>
              <div>
                <label className="block mb-1 text-sm font-medium">Reason:</label>
                <Input 
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Reason for correction"
                />
              </div>
              <div className="flex justify-end space-x-2">
                <Button variant="outline" onClick={() => { setSelectedEventId(null); setSelectedSessionId(null); setReason(""); }}>Cancel</Button>
                <Button onClick={handleCorrectTimestamp}>Save Correction</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
