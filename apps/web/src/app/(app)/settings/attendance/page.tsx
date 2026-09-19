"use client";

import React, { useState, useEffect } from "react";
import { getAttendanceSettingsAction, updateAttendanceSettingsAction } from "../../attendance/actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export default function AttendanceSettingsPage() {
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [timezone, setTimezone] = useState("Asia/Kolkata");
  const [effectiveDate, setEffectiveDate] = useState("");

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const data = await getAttendanceSettingsAction();
        if (data && data.length > 0) {
          const current = data[0];
          setStartTime(current.startTime || "09:00");
          setEndTime(current.endTime || "17:00");
          setTimezone(current.timezone || "Asia/Kolkata");
        }
      } catch (e) {
        console.error(e);
      }
    };
    loadSettings();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateAttendanceSettingsAction({ startTime, endTime, timezone, effectiveDate });
      alert("Settings saved successfully.");
    } catch (e) {
      console.error(e);
      alert("Failed to save settings.");
    }
  };

  return (
    <div className="p-4 space-y-4 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Global Attendance Schedule</h1>
      
      <Card>
        <CardHeader>
          <CardTitle>Define Working Schedule</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className="block mb-1 font-medium">Start Time</label>
              <input 
                type="time" 
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full border rounded p-2"
                required
              />
            </div>
            <div>
              <label className="block mb-1 font-medium">End Time</label>
              <input 
                type="time" 
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full border rounded p-2"
                required
              />
            </div>
            <div>
              <label className="block mb-1 font-medium">Timezone</label>
              <select 
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="w-full border rounded p-2"
                required
              >
                <option value="Asia/Kolkata">Asia/Kolkata</option>
                <option value="America/New_York">America/New_York</option>
                <option value="UTC">UTC</option>
              </select>
            </div>
            <div>
              <label className="block mb-1 font-medium">Effective Date</label>
              <input 
                type="date" 
                value={effectiveDate}
                onChange={(e) => setEffectiveDate(e.target.value)}
                className="w-full border rounded p-2"
                required
              />
            </div>
            <Button type="submit" className="w-full">Save Settings</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
