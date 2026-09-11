/**
 * @elscore/types — Shared TypeScript types and interfaces
 *
 * This package exports types shared between apps/api and apps/web.
 * It contains only type-level definitions — no runtime code.
 *
 * All types must be stable, well-named, and reflect the domain model.
 * Add types here when they are needed by more than one app.
 */

// ─── API Response Envelope ───────────────────────────────────────────────────

export interface ApiResponse<T> {
  data: T;
  meta?: Record<string, unknown>;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface ApiError {
  statusCode: number;
  message: string | string[];
  error?: string;
  correlationId?: string;
}

// ─── Identity ─────────────────────────────────────────────────────────────────

export type UserStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'PENDING_SETUP';

export type EmploymentStatus = 'ACTIVE' | 'INACTIVE' | 'TERMINATED' | 'ON_LEAVE';

export interface AuthenticatedUser {
  id: string;
  email: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

// ─── RBAC ─────────────────────────────────────────────────────────────────────

/**
 * Permission code format: resource.action
 * Examples: lead.read, lead.assign, payment.verify
 */
export type PermissionCode = string;

export interface RoleWithPermissions {
  id: string;
  code: string;
  name: string;
  permissions: PermissionCode[];
}

// ─── Human-readable Business IDs ─────────────────────────────────────────────

/**
 * Supported entity types for business ID generation.
 * Format: PREFIX-NNNN (e.g., EMP-0001, STU-0042)
 */
export type BusinessIdEntityType =
  | 'EMP'
  | 'LED'
  | 'STU'
  | 'TUT'
  | 'DEM'
  | 'ADM'
  | 'PAY'
  | 'CLS'
  | 'REN'
  | 'MTG';

// ─── Pagination ───────────────────────────────────────────────────────────────

export interface PaginationQuery {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

// ─── Audit ────────────────────────────────────────────────────────────────────

export type AuditAction =
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'ARCHIVE'
  | 'ASSIGN'
  | 'REASSIGN'
  | 'STATUS_CHANGE'
  | 'LOGIN'
  | 'LOGOUT'
  | 'PASSWORD_CHANGE'
  | string;
