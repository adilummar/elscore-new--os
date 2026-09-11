/**
 * field-access.utils.ts — DTO mapping helpers for field-level authorization.
 *
 * R-3 HARDENING: Provides explicit, testable utilities for omitting sensitive
 * fields from response DTOs based on resolved permission flags.
 *
 * ─── THE CANONICAL FOUR-STEP SAFE PATTERN ────────────────────────────────────
 *
 *   Every endpoint that returns data with access-controlled fields MUST follow:
 *
 *   STEP 1 — DATABASE QUERY / PROJECTION
 *     Fetch only the columns that may eventually be returned.
 *     Do not over-fetch sensitive columns and then decide to strip them later.
 *
 *     // Preferred: project at query time (exclude fields you never need)
 *     const student = await this.prisma.student.findUniqueOrThrow({
 *       where: { id },
 *       select: {
 *         id: true, firstName: true, lastName: true,
 *         // Only select parentPhone/parentEmail if the permission check
 *         // will have any chance of allowing them. In most cases, fetch
 *         // them and let the mapper gate — but never blindly fetch all
 *         // fields and forget to gate them.
 *         parentPhone: true,
 *         parentEmail: true,
 *       },
 *     });
 *
 *   STEP 2 — AUTHORIZATION DECISION
 *     Resolve the actor's access flags BEFORE building the response.
 *     Use AuthorizationService.resolveFieldAccess() for multi-field decisions.
 *
 *     const access = await this.authorizationService.resolveFieldAccess(
 *       currentUser.id,
 *       { parentContact: 'student.contact.read' },
 *     );
 *     // access.parentContact is false for Tutor, true for Mentor/Admin.
 *
 *   STEP 3 — AUTHORIZED DTO MAPPING
 *     Apply field gates in the mapper function using includeIf() or gateField().
 *     The mapper receives BOTH the data and the access flags — it gates inline.
 *
 *     // mapper function (student.mapper.ts):
 *     export function mapStudentToDto(
 *       student: StudentRecord,
 *       access: FieldAccessMap,
 *     ): StudentResponseDto {
 *       return {
 *         id: student.id,
 *         firstName: student.firstName,
 *         lastName: student.lastName,
 *         // Parent contact is gated:
 *         ...includeIf(access.parentContact, {
 *           parentPhone: student.parentPhone,
 *           parentEmail: student.parentEmail,
 *         }),
 *       };
 *     }
 *
 *   STEP 4 — RESPONSE
 *     Return the DTO. It contains ONLY what the actor is permitted to see.
 *     No further stripping is needed or performed.
 *
 *     return mapStudentToDto(student, access);
 *
 *   The service calls the mapper:
 *
 *     async getStudent(id: string, currentUser: RequestUser): Promise<StudentResponseDto> {
 *       // Step 1: DB query
 *       const student = await this.prisma.student.findUniqueOrThrow({ where: { id } });
 *       // Step 2: Auth decision
 *       const access = await this.authorizationService.resolveFieldAccess(currentUser.id, {
 *         parentContact: 'student.contact.read',
 *       });
 *       // Steps 3 + 4: Map and return
 *       return mapStudentToDto(student, access);
 *     }
 *
 * ─── CRITICAL RULES ──────────────────────────────────────────────────────────
 *
 *   DO NOT:
 *     - Return the raw Prisma record directly from a controller.
 *     - Fetch a field and conditionally set it to `undefined` based on a condition
 *       added AFTER the fact — this pattern is fragile and easy to bypass.
 *     - Use a generic "strip unauthorized fields" interceptor. This hides
 *       authorization decisions in infrastructure, making them invisible to
 *       code reviewers and making the system harder to reason about.
 *     - Trust any field-selector coming from the client request.
 *     - Rely on the frontend to hide sensitive fields. Backend MUST enforce.
 *
 *   DO:
 *     - Keep the four steps in order: DB → Auth → Mapper → Response.
 *     - Write one mapper function per DTO shape.
 *     - Pass the FieldAccessMap into the mapper as a parameter.
 *     - Test the mapper function independently from the service.
 *
 * ─── SENSITIVE FIELD CATEGORIES (known at Phase 0) ───────────────────────────
 *
 *   Permission              Fields gated
 *   ─────────────────────   ─────────────────────────────────────────────────
 *   student.contact.read    parentPhone, parentEmail
 *   student.finance.read    outstandingBalance, paymentHistory (future)
 *   employee.salary.read    salary, compensation data (future)
 *   (others TBD by domain module owners at implementation time)
 */

/**
 * A resolved map of field-group names to boolean access flags.
 * Produced by AuthorizationService.resolveFieldAccess().
 *
 * Key: the field group name (e.g. 'parentContact', 'financialDetails').
 * Value: true = actor is permitted to see this group; false = exclude it.
 */
export type FieldAccessMap = Record<string, boolean>;

/**
 * Conditionally includes fields in a DTO based on an access flag.
 *
 * Returns the fields object if allowed, or an empty object if not.
 * Use spread syntax to merge: `{ ...baseFields, ...includeIf(flag, sensitiveFields) }`
 *
 * When allowed=false, spreading {} into the parent object adds no properties.
 * This means the key is truly absent from the response, not just set to undefined.
 *
 * @param allowed  Whether the field group is accessible.
 * @param fields   The fields to include when permitted.
 *
 * @example
 *   return {
 *     id: student.id,
 *     name: student.name,
 *     ...includeIf(access.parentContact, {
 *       parentPhone: student.parentPhone,
 *       parentEmail: student.parentEmail,
 *     }),
 *   };
 */
export function includeIf<T extends object>(allowed: boolean, fields: T): T | Record<never, never> {
  return allowed ? fields : {};
}

/**
 * Returns the value if access is permitted, or undefined if not.
 *
 * Useful for single fields rather than groups.
 * Prefer includeIf() for groups of related fields (e.g. parentPhone + parentEmail together).
 *
 * Note: when allowed=false the property is present in the object but set to undefined.
 * Use includeIf() if you need the property to be entirely absent from the response.
 *
 * @example
 *   parentPhone: gateField(access.parentContact, student.parentPhone),
 */
export function gateField<T>(allowed: boolean, value: T): T | undefined {
  return allowed ? value : undefined;
}
