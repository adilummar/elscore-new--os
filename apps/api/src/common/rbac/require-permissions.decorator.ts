import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'requiredPermissions';

/**
 * Specifies which permissions are required to access a route.
 * Used in conjunction with RbacGuard.
 *
 * Usage:
 *   @RequirePermissions('lead.read')
 *   @RequirePermissions('payment.verify', 'payment.read')  // ALL must be held
 *   @Get('leads')
 *   getLeads() { ... }
 *
 * Permission format: resource.action (e.g. 'lead.read', 'employee.create')
 *
 * Record-scope enforcement (e.g. "only your assigned leads") is NOT done
 * in this decorator or guard. It must be enforced at the service layer
 * using the authenticated user's ID from the request context.
 */
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
