"use client";

import * as React from 'react';
import { getMyAvailability, saveMyAvailability } from '../mentoring/mentoring-client';
import { AvailabilityWindow } from '../mentoring/tutor-availability';
import { TutorAvailabilityEditor } from '../mentoring/students/[id]/TutorAvailabilityEditor';

/**
 * A tutor's own weekly working hours. The same editor is used by HR staff from the student page; here a tutor changes
 * only their own, and the API refuses anyone who is not a tutor. Saving never changes a class that is already booked:
 * students whose tutor no longer fits are flagged for their Mentor to review.
 */
export default function MyAvailabilityPage() {
  const [state, setState] = React.useState<{ name: string; windows: AvailabilityWindow[] } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);
  const [version, setVersion] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    getMyAvailability()
      .then((mine) => !cancelled && (setState(mine), setError(null)))
      .catch((e: unknown) => !cancelled && setError(e instanceof Error && e.message ? e.message : 'Your working hours could not be loaded.'));
    return () => {
      cancelled = true;
    };
  }, [version]);

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <h1 className="text-xl font-semibold text-slate-900">My availability</h1>
      {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {saved && <p role="status" className="rounded-md bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">Your working hours are saved.</p>}
      {state && (
        <TutorAvailabilityEditor
          key={version}
          name={state.name}
          initial={state.windows}
          onSave={async (windows) => {
            await saveMyAvailability(windows);
            setSaved(true);
            setVersion((v) => v + 1);
          }}
        />
      )}
    </div>
  );
}
