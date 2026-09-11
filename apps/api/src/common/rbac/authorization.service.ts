import { ForbiddenException, Injectable } from '@nestjs/common';

import { RbacService } from './rbac.service';

/**
 * AuthorizationService — reusable authorization utilities for domain services.
 *
 * R-3 HARDENING: Establishes an explicit, testable pattern for:
 *   1. Permission checks (coarse-grained, via RbacGuard / inline)
 *   2. Record-scope / ownership checks
 *   3. Field-level sensitive data access
 *
 * ─── DESIGN PRINCIPLES ───────────────────────────────────────────────────────
 *
 *   EXPLICIT AUTHORIZATION
 *     Authorization decisions are explicit in code — nothing is silently
 *     stripped by a generic interceptor. Every check can be read, reviewed,
 *     and tested in isolation. This is intentional, not a limitation.
 *
 *   AUDITING RESPONSIBILITY
 *     This service does NOT itself record audit events.
 *     Authorization checks here are explicit and testable, but not audited
 *     individually (auditing every permission check would be extremely noisy).
 *
 *     Instead: domain operations are responsible for auditing privileged or
 *     security-sensitive actions where required. For example:
 *       - A payment verification action should be audited by PaymentService.
 *       - A denied access attempt on a sensitive resource may be audited
 *         by the domain policy of that resource.
 *       - Routine read operations generally do not need to be audited.
 *
 *     Rule of thumb: audit the domain action, not the authorization check.
 *
 *   OWNERSHIP IS NOT UNIVERSAL
 *     assertOwnership() is a reusable helper for the common pattern of
 *     "actor must own the resource OR hold a bypass permission."
 *     It is NOT the universal authorization model.
 *
 *     Future domain modules must implement resource-specific policies:
 *       - Sales lead ownership      → Sales Counsellor owns their leads
 *       - Mentor student assignment → Mentor is linked to assigned students
 *       - Tutor class assignment    → Tutor is assigned to specific classes/groups
 *       - Academic-wide access      → Academic Head sees all classes
 *       - Finance access            → Finance staff access financial records
 *       - Other domain scopes       → defined by each domain's business rules
 *
 *     Simple ownership matching is rarely sufficient on its own.
 *     Use this helper as a building block, not a complete policy.
 *
 *   SOURCE OF TRUTH
 *     - resourceOwnerId must ALWAYS come from the DB record, never from the client.
 *     - actorId must ALWAYS come from req.user (set by JwtStrategy).
 *     - Field-selector inputs from the client must never be trusted.
 *
 * ─── CANONICAL PATTERN FOR DOMAIN MODULE ENDPOINTS ───────────────────────────
 *
 *   Step 1 — Route guard (coarse permission):
 *     @RequirePermissions('lead.read')
 *
 *   Step 2 — DB query/projection (fetch only the fields you may expose):
 *     const lead = await this.prisma.lead.findUniqueOrThrow({ where: { id } });
 *
 *   Step 3 — Authorization decision (record scope + field access):
 *     await this.authorizationService.assertOwnership({
 *       resourceOwnerId: lead.assignedToUserId,   // from DB — never client
 *       actorId: currentUser.id,
 *       bypassPermission: 'lead.read.all',
 *     });
 *     const access = await this.authorizationService.resolveFieldAccess(actorId, {
 *       parentContact: 'student.contact.read',
 *     });
 *
 *   Step 4 — Authorized DTO mapping (apply field gates before returning):
 *     return mapLeadToDto(lead, access);
 *     // mapLeadToDto uses includeIf() to exclude unauthorized fields.
 *
 *   The response contains ONLY what the actor is permitted to see.
 *   Sensitive fields are excluded AT MAPPING TIME, not after the fact.
 *   There is no generic "strip all unauthorized fields" interceptor —
 *   this is intentional. Each mapper is explicit and auditable.
 *
 * See field-access.utils.ts and ownership.utils.ts for standalone helpers.
 */
@Injectable()
export class AuthorizationService {
  constructor(private readonly rbacService: RbacService) {}

  /**
   * Checks if the actor holds a single permission.
   * Returns true/false — does not throw. Use for conditional field access.
   */
  async hasPermission(actorId: string, permission: string): Promise<boolean> {
    return this.rbacService.hasPermissions(actorId, [permission]);
  }

  /**
   * Checks if the actor holds ALL of the given permissions.
   * Returns true/false — does not throw.
   */
  async hasPermissions(actorId: string, permissions: string[]): Promise<boolean> {
    return this.rbacService.hasPermissions(actorId, permissions);
  }

  /**
   * Asserts that the actor owns the resource OR holds the bypass permission.
   *
   * Use this for record-scope enforcement:
   *   - A Sales Counsellor can only read their own assigned leads.
   *   - A Sales Head can read all leads (bypass permission: 'lead.read.all').
   *
   * NOTE: This is a building block, not a complete authorization policy.
   * See the class-level documentation for domain-specific ownership guidance.
   *
   * @param resourceOwnerId  - The user ID stored on the record (e.g. lead.assignedToUserId).
   *                           Must come from the DB, NEVER from the client request.
   * @param actorId          - The currently authenticated user's ID from req.user.
   * @param bypassPermission - Optional permission code that grants access regardless of ownership.
   *
   * @throws ForbiddenException if actor is not owner and does not hold bypass permission.
   */
  async assertOwnership(opts: {
    resourceOwnerId: string | null | undefined;
    actorId: string;
    bypassPermission?: string;
    errorMessage?: string;
  }): Promise<void> {
    const { resourceOwnerId, actorId, bypassPermission, errorMessage } = opts;

    // Direct ownership
    if (resourceOwnerId && resourceOwnerId === actorId) {
      return;
    }

    // Bypass via elevated permission
    if (bypassPermission) {
      const hasBypass = await this.rbacService.hasPermissions(actorId, [bypassPermission]);
      if (hasBypass) {
        return;
      }
    }

    throw new ForbiddenException(
      errorMessage ?? 'You do not have access to this resource',
    );
  }

  /**
   * Asserts that the actor holds at least one of the given permissions.
   * Used when access can be granted by ANY of several roles.
   *
   * @throws ForbiddenException if none of the permissions are held.
   */
  async assertAnyPermission(
    actorId: string,
    permissions: string[],
    errorMessage?: string,
  ): Promise<void> {
    const actorPermissions = await this.rbacService.getPermissionsForUser(actorId);
    const hasAny = permissions.some((p) => actorPermissions.has(p));
    if (!hasAny) {
      throw new ForbiddenException(
        errorMessage ?? `Access denied. Required one of: ${permissions.join(', ')}`,
      );
    }
  }

  /**
   * Resolves which sensitive field groups the actor may access.
   *
   * Returns a plain object of booleans used by DTO mappers to include/exclude fields.
   * The mapper decides which fields to omit — this service only resolves the flags.
   *
   * This is Step 3 in the canonical four-step pattern (see class docs).
   * The result is passed directly to the DTO mapper (Step 4) — never to the client.
   *
   * EXAMPLE — Parent contact privacy (requirement from spec):
   *   Tutors MUST NOT see parent phone / email.
   *   Only roles with 'student.contact.read' may see it.
   *
   *   const access = await this.auth.resolveFieldAccess(currentUser.id, {
   *     parentContact: 'student.contact.read',
   *     financialDetails: 'student.finance.read',
   *   });
   *   // access.parentContact === false for Tutor role
   *   // Use access.parentContact in the DTO mapper to gate the field.
   *
   * @param actorId   - The actor's user ID.
   * @param fieldMap  - Map of fieldGroup name → required permission code.
   * @returns         - Map of fieldGroup name → boolean (true = permitted).
   */
  async resolveFieldAccess(
    actorId: string,
    fieldMap: Record<string, string>,
  ): Promise<Record<string, boolean>> {
    const actorPermissions = await this.rbacService.getPermissionsForUser(actorId);
    const result: Record<string, boolean> = {};
    for (const [field, permission] of Object.entries(fieldMap)) {
      result[field] = actorPermissions.has(permission);
    }
    return result;
  }
}
