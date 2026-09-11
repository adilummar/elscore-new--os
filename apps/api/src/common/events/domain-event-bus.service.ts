import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import type { DomainEvent } from './domain-event';

/**
 * DomainEventBusService — thin wrapper around EventEmitter2.
 *
 * Domain modules use this service to emit events after successful transactions.
 * Listeners are registered with @OnEvent('event.name') in the same process.
 *
 * Usage:
 *   // After successful business operation:
 *   await this.eventBus.publish({
 *     eventName: 'admission.closed',
 *     admissionId: admission.id,
 *     studentId: student.id,
 *     actorUserId: currentUser.id,
 *     occurredAt: new Date(),
 *   });
 *
 *   // In a listener:
 *   @OnEvent('admission.closed')
 *   async handleAdmissionClosed(event: AdmissionClosedEvent) { ... }
 *
 * Important: Listener failures do NOT roll back the business operation.
 * Listeners should be defensive and not throw for non-critical side effects.
 * For critical guaranteed delivery, use the outbox pattern + BullMQ.
 */
@Injectable()
export class DomainEventBusService {
  constructor(private readonly emitter: EventEmitter2) {}

  async publish(event: DomainEvent): Promise<void> {
    await this.emitter.emitAsync(event.eventName, event);
  }

  publishSync(event: DomainEvent): void {
    this.emitter.emit(event.eventName, event);
  }
}
