import type { FakeDb } from './mentoring-fake-db';

/**
 * Makes a class ready to verify in a test: a voice recording that was uploaded and shared, and three activities that were created
 * and shared. Verification is strict, so tests that are about something other than the voice or the activities start from here.
 */
export function readyToVerify(db: FakeDb, sessionId: string) {
  const when = new Date('2026-01-01T00:00:00Z');
  if (!db.rows('mentoringClassAttachment').some((a) => a.sessionId === sessionId && !a.supersededAt)) {
    db.seed('mentoringClassAttachment', { sessionId, kind: 'VOICE', fileKey: `fixture-${sessionId}`, fileName: 'voice.mp3', fileSize: 1000, mimeType: 'audio/mpeg', uploadedByUserId: 'fixture', sharedAt: when, sharedByUserId: 'fixture' });
  }
  const have = db.rows('mentoringClassActivity').filter((a) => a.sessionId === sessionId && !a.removedAt).length;
  for (let i = have; i < 3; i++) db.seed('mentoringClassActivity', { sessionId, position: i + 1, title: `Activity ${i + 1}`, type: 'WORKSHEET', instructions: 'Do the worksheet.', createdByUserId: 'fixture', sharedAt: when, sharedByUserId: 'fixture' });
}

/** Wraps verify so it makes the class ready first. Returns the real, strict verify for the tests about strictness. */
export function makeVerifyLenient<S extends { verify: (...a: any[]) => Promise<any> }>(service: S, db: FakeDb): S['verify'] {
  const strict = service.verify.bind(service) as S['verify'];
  (service as { verify: unknown }).verify = (sessionId: string, ...rest: unknown[]) => {
    readyToVerify(db, sessionId);
    return (strict as (...a: unknown[]) => Promise<unknown>)(sessionId, ...rest);
  };
  return strict;
}
