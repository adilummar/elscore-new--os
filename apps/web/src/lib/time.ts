/**
 * Centralized timezone utility for EL SCORE OS.
 * All business times are displayed in IST (Asia/Kolkata, UTC+5:30).
 * The server stores UTC in the DB — this utility converts for display only.
 */

export const BUSINESS_TIMEZONE = 'Asia/Kolkata';
export const BUSINESS_LOCALE   = 'en-IN';

/** "2:04 PM" */
export function fmtTime(ts: string | Date | null | undefined): string {
  if (!ts) return '-';
  return new Date(ts).toLocaleTimeString(BUSINESS_LOCALE, {
    timeZone: BUSINESS_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

/** "29/09/2026" */
export function fmtDate(ts: string | Date | null | undefined): string {
  if (!ts) return '-';
  return new Date(ts).toLocaleDateString(BUSINESS_LOCALE, {
    timeZone: BUSINESS_TIMEZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/** "29/09/2026, 2:04 PM" */
export function fmtDateTime(ts: string | Date | null | undefined): string {
  if (!ts) return '-';
  return new Date(ts).toLocaleString(BUSINESS_LOCALE, {
    timeZone: BUSINESS_TIMEZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

/** "Mon, 29 Sep" */
export function fmtShortDate(ts: string | Date | null | undefined): string {
  if (!ts) return '-';
  return new Date(ts).toLocaleDateString(BUSINESS_LOCALE, {
    timeZone: BUSINESS_TIMEZONE,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}
