"use client";

import React, { useState, useEffect } from "react";
import { getTeamAttendanceAction, correctAttendanceEventAction } from "../actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import { Input } from "@/components/ui/Input";

export default function AttendanceManagementPage() {
  const [date, setDate] = useState<string>(new Date().toISOString().split("T")[0]);
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

  useEffect(() => {
    fetchTeamAttendance();
  }, [date]);

  const handleCorrectTimestamp = async () => {
    if (!selectedEventId || !selectedSessionId || !newTimestamp) return;
    try {
      await correctAttendanceEventAction(selectedEventId, selectedSessionId, newTimestamp, reason);
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
                <TableHead>Check In</TableHead>
                <TableHead>Check Out</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {teamData.map((record) => (
                <TableRow key={record.id}>
                  <TableCell>{record.employeeName}</TableCell>
                  <TableCell>{record.status}</TableCell>
                  <TableCell>{record.checkIn}</TableCell>
                  <TableCell>{record.checkOut}</TableCell>
                  <TableCell>
                    <Button variant="outline" size="sm" onClick={() => { setSelectedEventId(record.eventId); setSelectedSessionId(record.id); }}>Correct Time</Button>
                  </TableCell>
                </TableRow>
              ))}
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
              <div>
                <label className="block mb-1">New Timestamp:</label>
                <input 
                  type="datetime-local" 
                  value={newTimestamp}
                  onChange={(e) => setNewTimestamp(e.target.value)}
                  className="w-full border rounded p-2"
                />
              </div>
              <div>
                <label className="block mb-1">Reason:</label>
                <Input 
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Reason for correction"
                />
              </div>
              <div className="flex justify-end space-x-2">
                <Button variant="outline" onClick={() => { setSelectedEventId(null); setSelectedSessionId(null); setReason(""); }}>Cancel</Button>
                <Button onClick={handleCorrectTimestamp}>Save</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
