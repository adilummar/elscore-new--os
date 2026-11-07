import { isStaleMessage, saveField, setVerification, verifyBlockedReason } from './field-actions';
import { EditableFieldMeta } from './handover-presentation';

const meta = (type: EditableFieldMeta['type'], extra: Partial<EditableFieldMeta> = {}): EditableFieldMeta => ({ key: 'k', type, options: null, columns: null, maxLength: null, minDate: null, maxDate: null, ...extra });
const STALE = 'This information was changed by someone else since you opened it. Load the latest value and try again.';

describe('saving a field', () => {
  it('cleans the value, sends it with the value the Mentor was looking at, and reports saved', async () => {
    const send = jest.fn().mockResolvedValue(undefined);
    await expect(saveField(meta('TEXT'), '  Aarav  ', 'Aarav K', send)).resolves.toEqual({ kind: 'saved', value: 'Aarav' }); // the cleaned value is the card's new baseline
    expect(send).toHaveBeenCalledWith('Aarav', 'Aarav K');
  });

  it('collecting a missing field sends null as the value it was based on', async () => {
    const send = jest.fn().mockResolvedValue(undefined);
    await saveField(meta('SELECT', { options: ['Male', 'Female', 'Other'] }), 'Female', undefined, send);
    expect(send).toHaveBeenCalledWith('Female', null);
  });

  it.each([
    ['empty text', meta('TEXT'), ''],
    ['text with a line break in a single-line field', meta('TEXT'), 'a\nb'],
    ['too long text', meta('TEXT', { maxLength: 5 }), 'abcdef'],
    ['a phone number that is too short', meta('PHONE'), '12345'],
    ['a phone number with letters', meta('PHONE'), 'call me'],
    ['a date that does not exist', meta('DATE'), '2015-02-30'],
    ['a date in the future', meta('DATE', { maxDate: '2026-11-07' }), '2030-01-01'],
    ['a date before the earliest allowed', meta('DATE', { minDate: '1990-01-01' }), '1980-01-01'],
    ['no choice made in a select', meta('SELECT', { options: ['Male', 'Female'] }), ''],
    ['a value that is not an option', meta('SELECT', { options: ['Male', 'Female'] }), 'Robot'],
    ['a list row missing a required column', meta('ROWS', { columns: [{ key: 'subject', label: 'Subject', type: 'text', required: true }] }), [{ subject: '' }]],
  ])('refuses %s without calling the API', async (_label, fieldMeta, draft) => {
    const send = jest.fn();
    const outcome = await saveField(fieldMeta, draft as any, null, send);
    expect(outcome.kind).toBe('invalid');
    expect((outcome as { message: string }).message.length).toBeGreaterThan(3);
    expect(send).not.toHaveBeenCalled();
  });

  it('keeps the draft usable after an API failure: the same draft can be saved again and succeeds', async () => {
    const send = jest.fn().mockRejectedValueOnce(new Error('The server is not reachable')).mockResolvedValueOnce(undefined);
    const first = await saveField(meta('PHONE'), '+91 98765 43210', null, send);
    expect(first).toEqual({ kind: 'failed', message: 'The server is not reachable' });
    const retry = await saveField(meta('PHONE'), '+91 98765 43210', null, send);
    expect(retry).toEqual({ kind: 'saved', value: '+91 98765 43210' });
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1]).toEqual(send.mock.calls[0]); // nothing was lost or changed between the attempts
  });

  it('gives a readable message when the failure has none', async () => {
    const outcome = await saveField(meta('TEXT'), 'x', null, () => Promise.reject('boom'));
    expect(outcome).toEqual({ kind: 'failed', message: 'The information could not be saved. Please try again.' });
  });

  it('recognises a stale save: someone else changed the value, nothing was written, and the Mentor is told to load the latest', async () => {
    const outcome = await saveField(meta('TEXT'), 'Aarav', 'Arav', () => Promise.reject(new Error(STALE)));
    expect(outcome).toEqual({ kind: 'stale', message: STALE });
    expect(isStaleMessage(STALE)).toBe(true);
    expect(isStaleMessage('The server is not reachable')).toBe(false);
    expect(isStaleMessage(null)).toBe(false);
  });
});

describe('verifying a field', () => {
  const stored = { collection: 'FROM_SALES' as const, hasUnsavedChange: false, storedValue: 'Asha' };

  it('is blocked, without calling the API, while there is nothing to verify', async () => {
    const send = jest.fn();
    await expect(setVerification(true, { ...stored, collection: 'PENDING', storedValue: null }, send)).resolves.toEqual({ kind: 'blocked', message: 'Enter and save a value first' });
    expect(send).not.toHaveBeenCalled();
  });

  it('is blocked while the Mentor has an unsaved change, so an unsaved value can never be confirmed', async () => {
    const send = jest.fn();
    await expect(setVerification(true, { ...stored, hasUnsavedChange: true }, send)).resolves.toEqual({ kind: 'blocked', message: 'Save your change first' });
    expect(send).not.toHaveBeenCalled();
  });

  it('is an explicit action on the stored value: verified true, with the value the Mentor was looking at', async () => {
    const send = jest.fn().mockResolvedValue(undefined);
    await expect(setVerification(true, stored, send)).resolves.toEqual({ kind: 'done' });
    expect(send).toHaveBeenCalledWith(true, 'Asha');
  });

  it('withdrawing a verification is its own explicit call, not a silent erase', async () => {
    const send = jest.fn().mockResolvedValue(undefined);
    await expect(setVerification(false, stored, send)).resolves.toEqual({ kind: 'done' });
    expect(send).toHaveBeenCalledWith(false, 'Asha');
  });

  it('reports an API failure and succeeds on retry', async () => {
    const send = jest.fn().mockRejectedValueOnce(new Error('Gateway timeout')).mockResolvedValueOnce(undefined);
    await expect(setVerification(true, stored, send)).resolves.toEqual({ kind: 'failed', message: 'Gateway timeout' });
    await expect(setVerification(true, stored, send)).resolves.toEqual({ kind: 'done' });
  });

  it('recognises a stale confirmation: the value changed under the Mentor, so it is not confirmed', async () => {
    await expect(setVerification(true, stored, () => Promise.reject(new Error(STALE)))).resolves.toEqual({ kind: 'stale', message: STALE });
  });

  it('the checkbox reasons agree with the outcomes', () => {
    expect(verifyBlockedReason('PENDING', false)).toBe('Enter and save a value first');
    expect(verifyBlockedReason('COLLECTED', true)).toBe('Save your change first');
    expect(verifyBlockedReason('FROM_SALES', false)).toBeNull();
    expect(verifyBlockedReason('UPDATED', false)).toBeNull();
  });
});
