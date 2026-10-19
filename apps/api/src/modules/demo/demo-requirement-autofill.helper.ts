export interface SessionAutofillRow {
  subjectId: string;
  requirementId: string;
  startTime: string;
  endTime: string;
}

/**
 * Builds default non-overlapping session rows from student requirements.
 * Deduplicates requirements by subjectId so only distinct subjects are populated by default.
 * If requirements are empty, returns a single unpopulated session row.
 */
export function buildDefaultSessionRows(requirements: any[] = []): SessionAutofillRow[] {
  if (!requirements || requirements.length === 0) {
    return [{ subjectId: '', requirementId: '', startTime: '10:00', endTime: '11:00' }];
  }

  const seenSubjects = new Set<string>();
  const uniqueReqs: any[] = [];
  for (const req of requirements) {
    const sId = req.subjectId || req.subject?.id;
    if (sId && !seenSubjects.has(sId)) {
      seenSubjects.add(sId);
      uniqueReqs.push(req);
    }
  }

  if (uniqueReqs.length === 0) {
    return [{ subjectId: '', requirementId: '', startTime: '10:00', endTime: '11:00' }];
  }

  const baseStartHour = 10;
  return uniqueReqs.map((req, idx) => {
    const startH = Math.min(baseStartHour + idx, 22);
    const endH = Math.min(startH + 1, 23);
    const startStr = `${startH.toString().padStart(2, '0')}:00`;
    const endStr = `${endH.toString().padStart(2, '0')}:00`;

    return {
      subjectId: req.subjectId || req.subject?.id || '',
      requirementId: req.id || '',
      startTime: startStr,
      endTime: endStr,
    };
  });
}
