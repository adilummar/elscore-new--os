/**
 * BullMQ queue name constants.
 *
 * Add a constant here when a new queue is introduced.
 * Reference this constant everywhere (producers and consumers).
 * Never use string literals for queue names in application code.
 */
export const QUEUES = {
  /**
   * Notifications queue — sends in-app (and future: email/push) notifications.
   * Jobs must be idempotent. Include an idempotency key in the job data.
   */
  NOTIFICATIONS: 'notifications',

  /**
   * Deadline monitor queue — scheduled checks for overdue actions.
   * Examples: overdue follow-ups, missing class updates, renewal reminders.
   */
  DEADLINE_MONITOR: 'deadline-monitor',

  /**
   * Audit projection queue — async side effects from domain events.
   * Kept separate from the audit_events table writes (which are synchronous).
   */
  AUDIT_PROJECTION: 'audit-projection',

  /**
   * Housekeeping queue — scheduled maintenance jobs.
   * Examples: expired refresh token cleanup, stale record pruning.
   * All jobs must be idempotent; safe to re-run if duplicated.
   */
  HOUSEKEEPING: 'housekeeping',
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

/**
 * BullMQ job name constants.
 *
 * Each job belongs to a specific queue. Do NOT reuse a job name across queues.
 * Job names are stored in Redis — never change an existing value without a migration plan.
 */
export const JOBS = {
  // ── HOUSEKEEPING queue ────────────────────────────────────────────────────
  /** Daily expired refresh-token cleanup. */
  TOKEN_CLEANUP: 'token-cleanup',
  /** Periodic reconciliation: find SCHEDULED follow-ups past due, transition to OVERDUE. */
  FOLLOWUP_OVERDUE_SCAN: 'followup-overdue-scan',
  /** Daily reset of round-robin counsellor states to ACTIVE. */
  ROUND_ROBIN_DAILY_RESET: 'round-robin-daily-reset',

  // ── DEADLINE_MONITOR queue ────────────────────────────────────────────────
  /** 10-minute reminder for a specific follow-up. jobId = followup-reminder-{fupId}. */
  FOLLOWUP_REMINDER: 'followup-reminder',
  /** Per-follow-up overdue transition. jobId = followup-overdue-{fupId}. */
  FOLLOWUP_OVERDUE: 'followup-overdue',

  // ── NOTIFICATIONS queue ───────────────────────────────────────────────────
  /** Consolidated Sales Head notification when a Sales employee checks out with incomplete FUPs. */
  FOLLOWUP_CHECKOUT_NOTIFY: 'followup-checkout-notify',

  // ── ATTENDANCE queue (uses HOUSEKEEPING) ──────────────────────────────────
  /** Daily job to automatically check out open sessions at the end of the calendar day. */
  ATTENDANCE_AUTO_CHECKOUT: 'attendance-auto-checkout',
} as const;

export type JobName = (typeof JOBS)[keyof typeof JOBS];
