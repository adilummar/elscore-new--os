/**
 * DomainEvent — base interface for all in-process domain events.
 *
 * In-process domain events use NestJS EventEmitter2 (not BullMQ).
 * They are fired after the primary business operation succeeds.
 * They are synchronous within the same process and request lifecycle.
 *
 * Use domain events for:
 *  - Notifying other modules of a state change (e.g. AdmissionClosed)
 *  - Triggering secondary actions that are not part of the atomic business op
 *  - Producing BullMQ jobs from event handlers (fire-and-forget)
 *
 * Do NOT use domain events for:
 *  - Operations that must be atomic with the business change (use transactions)
 *  - Operations that need guaranteed delivery across process restarts
 *    (use the outbox pattern + BullMQ instead)
 *
 * Event naming convention: PascalCase, past tense verb
 * Examples: LeadAssigned, DemoCompleted, AdmissionClosed, PaymentVerified
 */
export interface DomainEvent {
  /**
   * Unique name used by EventEmitter2. Format: entity.action
   * Example: 'lead.assigned', 'demo.completed', 'admission.closed'
   */
  readonly eventName: string;

  /**
   * ISO timestamp of when the event occurred.
   */
  readonly occurredAt: Date;

  /**
   * ID of the user who triggered this event. Undefined for system actions.
   */
  readonly actorUserId?: string;

  /**
   * Optional correlation ID for request tracing.
   */
  readonly correlationId?: string;
}

/**
 * Creates a base domain event with standard fields.
 */
export function createDomainEvent<T extends Omit<DomainEvent, 'occurredAt'>>(
  event: T,
): T & { occurredAt: Date } {
  return {
    ...event,
    occurredAt: new Date(),
  };
}
