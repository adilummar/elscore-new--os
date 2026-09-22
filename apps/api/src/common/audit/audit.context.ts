import { AsyncLocalStorage } from 'async_hooks';

export interface AuditContextState {
  realActorId?: string;
  isGodView?: boolean;
}

export const AuditContext = new AsyncLocalStorage<AuditContextState>();
