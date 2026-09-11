import { Global, Module } from '@nestjs/common';

import { DomainEventBusService } from './domain-event-bus.service';

@Global()
@Module({
  providers: [DomainEventBusService],
  exports: [DomainEventBusService],
})
export class DomainEventsModule {}
