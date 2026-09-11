import { ForbiddenException } from '@nestjs/common';

/**
 * ownership.utils.ts — Standalone ownership assertion helpers.
 *
 * R-3 HARDENING: Provides pure-function alternatives to AuthorizationService.assertOwnership()
 * for cases where the permission bypass is already resolved by the caller,
 * or where the ownership check is simple enough not to require an injected service.
 *
 * ─── OWNERSHIP IS A BUILDING BLOCK, NOT A COMPLETE POLICY ───────────────────
 *
 *   These helpers capture the common pattern:
 *     "The actor must own this record OR hold an elevated permission that bypasses ownership."
 *
 *   They are NOT a universal authorization model.
 *
 *   Future domain modules MUST implement their own resource-specific policies.
 *   Ownership matching alone is rarely sufficient. Examples:
 *
 *   Sales lead ownership:
 *     A Sales Counsellor can access only their assigned leads (lead.assignedToUserId).
 *     A Sales Head can access all leads in the system (lead.read.all bypass).
 *     A Marketing staff member has no lead access regardless of assignment.
 *     → Requires: ownership check + role-based bypass + department scope.
 *
 *   Mentor student assignment:
 *     A Mentor can access students they are assigned to mentor.
 *     An Academic Head can access all students.
 *     Assignment is a many-to-many relationship, not a simple owner field.
 *     → Requires: join table lookup (MentorStudent), not a single OwnerId field.
 *
 *   Tutor class/student assignment:
 *     A Tutor is assigned to specific classes or groups, not individual students.
 *     Access to a student record follows from class membership.
 *     → Requires: class/group membership lookup.
 *
 *   Academic-wide access:
 *     Academic Head, Principal, or Director may access all academic records.
 *     → Requires: role/permission check only — no ownership involved.
 *
 *   Finance access:
 *     Finance staff access payment and fee records — never "own" them.
 *     → Requires: permission check only — no ownership involved.
 *
 *   Use assertOwnershipOrBypass() where direct record ownership applies.
 *   For multi-step or join-based access, write a domain-specific policy
 *   in the relevant domain service.
 *
 * ─── CRITICAL RULES (enforced by code review, not by TypeScript) ─────────────
 *
 *   1. resourceOwnerId MUST come from the database record, never from the
 *      client request body or query string.
 *   2. actorId MUST come from req.user (set by JwtStrategy after token validation).
 *   3. Never short-circuit ownership checks based on client-supplied resource IDs.
 *   4. Ownership alone is not a complete authorization policy — see above.
 *
 * ─── EXAMPLE USAGE in a domain service ──────────────────────────────────────
 *
 *   // Fetch record from DB first — resourceOwnerId comes from the DB, not client
 *   const lead = await this.prisma.lead.findUniqueOrThrow({ where: { id } });
 *
 *   // Resolve whether the actor has an elevated bypass permission
 *   const isSalesHead = await this.rbacService.hasPermissions(actorId, ['lead.read.all']);
 *
 *   // Assert ownership (or bypass if Sales Head)
 *   assertOwnershipOrBypass(lead.assignedToUserId, actorId, isSalesHead,
 *     'You can only access your own assigned leads');
 *
 *   return lead;
 */

/**
 * Throws ForbiddenException if actorId does not match resourceOwnerId
 * and bypass is not granted.
 *
 * @param resourceOwnerId  The owner ID stored on the DB record.
 * @param actorId          The authenticated user's ID (from req.user, not client input).
 * @param bypassGranted    True if the actor holds an elevated permission that overrides ownership.
 * @param message          Optional custom error message.
 */
export function assertOwnershipOrBypass(
  resourceOwnerId: string | null | undefined,
  actorId: string,
  bypassGranted: boolean,
  message = 'You do not have access to this resource',
): void {
  if (bypassGranted) return;
  if (resourceOwnerId && resourceOwnerId === actorId) return;
  throw new ForbiddenException(message);
}

/**
 * Returns true if the actor owns the resource or has bypass access.
 * Non-throwing variant — use when you need to make a branching decision
 * rather than immediately failing.
 */
export function isOwnerOrHasBypass(
  resourceOwnerId: string | null | undefined,
  actorId: string,
  bypassGranted: boolean,
): boolean {
  return bypassGranted || (!!resourceOwnerId && resourceOwnerId === actorId);
}
