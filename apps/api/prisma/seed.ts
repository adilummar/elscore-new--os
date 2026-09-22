/**
 * Prisma Seed — EL SCORE OS
 *
 * Seeds all essential reference data required before any business module can operate.
 *
 * Sections (in order):
 *   1. Departments
 *   2. Roles             — with isSystem / isProtected / isCustom flags
 *   3. Permissions       — with isDelegatable flag per Revision 3.1 catalog
 *   4. Role–Permission assignments
 *   5. ID Sequences
 *   6. Reference data    — Subject, Grade, Curriculum (initial entries; admin-manageable)
 *   7. Initial admin user (first-run only)
 *
 * Idempotent: safe to run multiple times (upsert on unique keys).
 * Run with: pnpm db:seed
 */

import { PrismaClient, UserStatus, EmploymentStatus, DepartmentStatus } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

// =============================================================================
// DEPARTMENTS
// =============================================================================

const DEPARTMENTS = [
  { code: 'ADMIN', name: 'Administration' },
  { code: 'MARKETING', name: 'Marketing' },
  { code: 'SALES', name: 'Sales' },
  { code: 'ACADEMICS', name: 'Academics' },
  { code: 'FINANCE', name: 'Finance' },
  { code: 'HR', name: 'Human Resources' },
];

// =============================================================================
// ROLES
//
// isSystem:    true for all seeded roles — cannot be deleted via API.
// isProtected: true for CEO and CO_FOUNDER only — HR Manager cannot assign these.
// isCustom:    false for all seeded roles — custom roles are created at runtime.
// =============================================================================

const ROLES: Array<{
  code: string;
  name: string;
  description?: string;
  isSystem: boolean;
  isProtected: boolean;
  isCustom: boolean;
}> = [
  {
    code: 'CEO',
    name: 'CEO',
    description: 'Chief Executive Officer — full access to all operations',
    isSystem: true,
    isProtected: true,
    isCustom: false,
  },
  {
    code: 'CO_FOUNDER',
    name: 'Co-Founder',
    description:
      'Co-Founder — CEO-level read visibility, completely read-only. ' +
      'Must not simultaneously hold any other role. Backend-enforced.',
    isSystem: true,
    isProtected: true,
    isCustom: false,
  },
  {
    code: 'OPERATIONS_MANAGER',
    name: 'Operations Manager',
    description: 'Org-wide operational monitoring',
    isSystem: true,
    isProtected: false,
    isCustom: false,
  },
  // Marketing
  {
    code: 'MARKETING_HEAD',
    name: 'Marketing Head',
    isSystem: true,
    isProtected: false,
    isCustom: false,
  },
  {
    code: 'PERFORMANCE_MARKETER',
    name: 'Performance Marketer',
    isSystem: true,
    isProtected: false,
    isCustom: false,
  },
  { code: 'DESIGNER', name: 'Designer', isSystem: true, isProtected: false, isCustom: false },
  // Sales
  {
    code: 'SALES_HEAD',
    name: 'Sales Head',
    description: 'All Sales leads, performance, reports',
    isSystem: true,
    isProtected: false,
    isCustom: false,
  },
  {
    code: 'SALES_COUNSELLOR',
    name: 'Sales Counsellor',
    description: 'Assigned leads only; cannot reassign or override terminal stages',
    isSystem: true,
    isProtected: false,
    isCustom: false,
  },
  // Academics
  {
    code: 'ACADEMIC_HEAD',
    name: 'Academic Head',
    isSystem: true,
    isProtected: false,
    isCustom: false,
  },
  {
    code: 'MENTOR',
    name: 'Mentor',
    description:
      'Student coordination, timetable, tutor feedback (daily + weekly mandatory rating)',
    isSystem: true,
    isProtected: false,
    isCustom: false,
  },
  {
    code: 'DEMO_COORDINATOR',
    name: 'Demo Coordinator',
    description: 'Tutor search, demo scheduling, post-demo feedback',
    isSystem: true,
    isProtected: false,
    isCustom: false,
  },
  {
    code: 'TUTOR',
    name: 'Tutor',
    description: 'Execution-only: self-service for own profile, subjects, grades, availability',
    isSystem: true,
    isProtected: false,
    isCustom: false,
  },
  // Finance
  {
    code: 'FINANCE_HEAD',
    name: 'Finance Head',
    isSystem: true,
    isProtected: false,
    isCustom: false,
  },
  {
    code: 'FINANCE_MANAGER',
    name: 'Finance Manager',
    isSystem: true,
    isProtected: false,
    isCustom: false,
  },
  {
    code: 'FINANCE_EXECUTIVE',
    name: 'Finance Executive',
    isSystem: true,
    isProtected: false,
    isCustom: false,
  },
  { code: 'ACCOUNTANT', name: 'Accountant', isSystem: true, isProtected: false, isCustom: false },
  // HR
  {
    code: 'HR_MANAGER',
    name: 'HR Manager',
    description:
      'All employees, custom role creation, permission management, suspend users, Tutor rate control',
    isSystem: true,
    isProtected: false,
    isCustom: false,
  },
  {
    code: 'HR_EXECUTIVE',
    name: 'HR Executive',
    description:
      'Tutor recruitment and account creation; additional duties delegated by HR Manager',
    isSystem: true,
    isProtected: false,
    isCustom: false,
  },
  {
    code: 'HR_ASSISTANT',
    name: 'HR Assistant',
    description: 'No fixed permissions; individual duties delegated by HR Manager',
    isSystem: true,
    isProtected: false,
    isCustom: false,
  },
];

// =============================================================================
// PERMISSIONS
//
// isDelegatable:
//   true  = HR Manager may grant this to HR Assistant / HR Executive via UserPermission.
//   false = obtainable ONLY through role assignment.
//
// Non-delegatable includes: all role/system/security-level permissions,
// user.manage-status, employee.manage-status, tutor.rate.manage, reference.manage,
// audit.view, tutor.feedback.read, and all org-wide read permissions.
// =============================================================================

const PERMISSIONS: Array<{
  code: string;
  resource: string;
  action: string;
  description?: string;
  isDelegatable: boolean;
}> = [
  // Slice 2F: Attendance
  { code: 'attendance.student.read', resource: 'attendance.student', action: 'read', description: 'Read student attendance', isDelegatable: false },
  { code: 'attendance.student.mark', resource: 'attendance.student', action: 'mark', description: 'Mark student attendance', isDelegatable: false },
  { code: 'attendance.student.correct', resource: 'attendance.student', action: 'correct', description: 'Correct student attendance', isDelegatable: false },
  { code: 'attendance.tutor.read', resource: 'attendance.tutor', action: 'read', description: 'Read tutor attendance', isDelegatable: false },
  { code: 'attendance.tutor.mark', resource: 'attendance.tutor', action: 'mark', description: 'Mark tutor attendance', isDelegatable: false },
  { code: 'attendance.tutor.correct', resource: 'attendance.tutor', action: 'correct', description: 'Correct tutor attendance', isDelegatable: false },
  { code: 'attendance.tutor.verify', resource: 'attendance.tutor', action: 'verify', description: 'Verify tutor attendance for payroll', isDelegatable: false },


  
    // ---------------------------------------------------------------------------
    // Employee Attendance & Work-Time (Slice 2G)
    // ---------------------------------------------------------------------------
    { code: 'attendance.action.own', resource: 'attendance.employee', action: 'action.own', description: 'Perform check-in, check-out, break start/end', isDelegatable: false },
    { code: 'attendance.read.own', resource: 'attendance.employee', action: 'read.own', description: 'Read own attendance history', isDelegatable: false },
    { code: 'attendance.read.team', resource: 'attendance.employee', action: 'read.team', description: 'Read team attendance history', isDelegatable: false },
    { code: 'attendance.correct', resource: 'attendance.employee', action: 'correct', description: 'Correct historical attendance records', isDelegatable: false },
    { code: 'attendance.settings.manage', resource: 'attendance.employee', action: 'settings.manage', description: 'Manage global working schedule', isDelegatable: false },

    // ---------------------------------------------------------------------------
  // Finance (Slice 2E)
  // ---------------------------------------------------------------------------
  { code: 'finance.invoice.create', resource: 'invoice', action: 'create', isDelegatable: true },
  { code: 'finance.invoice.read', resource: 'invoice', action: 'read', isDelegatable: true },
  { code: 'finance.invoice.issue', resource: 'invoice', action: 'issue', isDelegatable: true },
  { code: 'finance.invoice.void', resource: 'invoice', action: 'void', isDelegatable: true },
  
  { code: 'finance.payment.create', resource: 'payment', action: 'create', isDelegatable: true },
  { code: 'finance.payment.read', resource: 'payment', action: 'read', isDelegatable: true },
  { code: 'finance.payment.reverse', resource: 'payment', action: 'reverse', isDelegatable: false },
  
  { code: 'finance.refund.request', resource: 'refund', action: 'request', isDelegatable: true },
  { code: 'finance.refund.approve', resource: 'refund', action: 'approve', isDelegatable: false },
  { code: 'finance.refund.execute', resource: 'refund', action: 'execute', isDelegatable: false },
  { code: 'finance.refund.read', resource: 'refund', action: 'read', isDelegatable: true },
  
  { code: 'finance.receipt.read', resource: 'receipt', action: 'read', isDelegatable: true },
  { code: 'finance.report.read', resource: 'finance_report', action: 'read', isDelegatable: false },

  // ---------------------------------------------------------------------------
  // Demo (Slice 2D)
  // ---------------------------------------------------------------------------
  {
    code: 'demo.book',
    resource: 'demo',
    action: 'book',
    description: 'Book a demo for permitted leads',
    isDelegatable: false,
  },
  {
    code: 'demo.read_own',
    resource: 'demo',
    action: 'read_own',
    description: 'Read permitted team/own demos',
    isDelegatable: false,
  },
  {
    code: 'demo.manage_team',
    resource: 'demo',
    action: 'manage_team',
    description: 'Manage/Reschedule/Cancel demos for team',
    isDelegatable: false,
  },
  {
    code: 'demo.cancel_own',
    resource: 'demo',
    action: 'cancel_own',
    description: 'Cancel own booked demo (before assignment)',
    isDelegatable: false,
  },
  {
    code: 'demo.reschedule_own',
    resource: 'demo',
    action: 'reschedule_own',
    description: 'Reschedule own booked demo (before assignment)',
    isDelegatable: false,
  },
  {
    code: 'demo.manage_all',
    resource: 'demo',
    action: 'manage_all',
    description: 'Demo Coordinator full operational management',
    isDelegatable: false,
  },
  {
    code: 'demo.assign_tutor',
    resource: 'demo',
    action: 'assign_tutor',
    description: 'Demo Coordinator assign tutor',
    isDelegatable: false,
  },
  {
    code: 'demo.read',
    resource: 'demo',
    action: 'read',
    description: 'Read all demos',
    isDelegatable: false,
  },
  {
    code: 'demo.read_assigned',
    resource: 'demo',
    action: 'read_assigned',
    description: 'Tutor read assigned demos',
    isDelegatable: false,
  },
  {
    code: 'demo.complete',
    resource: 'demo',
    action: 'complete',
    description: 'Tutor complete demo & submit feedback',
    isDelegatable: false,
  },
  {
    code: 'demo.mark_exceptions',
    resource: 'demo',
    action: 'mark_exceptions',
    description: 'Mark NO_SHOW, FALLBACK completion',
    isDelegatable: false,
  },

  // ── User management ───────────────────────────────────────────────────────
  {
    code: 'roundrobin.read',
    resource: 'roundrobin',
    action: 'read',
    description: 'View round robin state',
    isDelegatable: false,
  },
  {
    code: 'roundrobin.manage',
    resource: 'roundrobin',
    action: 'manage',
    description: 'Manage round robin pool and configuration',
    isDelegatable: false,
  },

  {
    code: 'user.read',
    resource: 'user',
    action: 'read',
    description: 'View user accounts',
    isDelegatable: true,
  },
  {
    code: 'user.create',
    resource: 'user',
    action: 'create',
    description: 'Create user + employee atomically',
    isDelegatable: false,
  },
  {
    code: 'user.update',
    resource: 'user',
    action: 'update',
    description: 'Update user profile fields',
    isDelegatable: true,
  },
  {
    code: 'user.manage-status',
    resource: 'user',
    action: 'manage-status',
    description: 'Activate, deactivate, or suspend user accounts',
    isDelegatable: false,
  },
  {
    code: 'user.reset-password',
    resource: 'user',
    action: 'reset-password',
    description: 'Force password reset for a user',
    isDelegatable: true,
  },
  {
    code: 'user.read-all',
    resource: 'user',
    action: 'read-all',
    description: 'Org-wide user list (not scoped to department)',
    isDelegatable: false,
  },

  // ── Employee ──────────────────────────────────────────────────────────────
  {
    code: 'employee.read',
    resource: 'employee',
    action: 'read',
    description: 'View employee profiles',
    isDelegatable: true,
  },
  {
    code: 'employee.create',
    resource: 'employee',
    action: 'create',
    description: 'Create an employee record',
    isDelegatable: false,
  },
  {
    code: 'employee.update',
    resource: 'employee',
    action: 'update',
    description: 'Update HR profile fields',
    isDelegatable: true,
  },
  {
    code: 'employee.manage-status',
    resource: 'employee',
    action: 'manage-status',
    description: 'Change employment status (terminate/reactivate)',
    isDelegatable: false,
  },
  {
    code: 'employee.read-all',
    resource: 'employee',
    action: 'read-all',
    description: 'Org-wide employee list',
    isDelegatable: false,
  },
  {
    code: 'god-view.enter',
    resource: 'system',
    action: 'god-view',
    description: 'Enter read-only God View as another user',
    isDelegatable: false,
  },

  // ── Departments ───────────────────────────────────────────────────────────
  {
    code: 'department.read',
    resource: 'department',
    action: 'read',
    description: 'View departments',
    isDelegatable: false,
  },
  {
    code: 'department.manage',
    resource: 'department',
    action: 'manage',
    description: 'Deactivate/reactivate departments',
    isDelegatable: false,
  },

  // ── Roles ─────────────────────────────────────────────────────────────────
  {
    code: 'role.read',
    resource: 'role',
    action: 'read',
    description: 'View roles and their permission sets',
    isDelegatable: false,
  },
  {
    code: 'roundrobin.history.read.own',
    resource: 'roundrobin.history',
    action: 'read.own',
    description: 'Read own distribution history',
    isDelegatable: false,
  },
  {
    code: 'roundrobin.history.read.team',
    resource: 'roundrobin.history',
    action: 'read.team',
    description: 'Read team distribution history',
    isDelegatable: false,
  },
  {
    code: 'roundrobin.history.read.all',
    resource: 'roundrobin.history',
    action: 'read.all',
    description: 'Read all distribution history',
    isDelegatable: false,
  },
  {
    code: 'role.create',
    resource: 'role',
    action: 'create',
    description: 'Create custom roles',
    isDelegatable: false,
  },
  {
    code: 'role.manage',
    resource: 'role',
    action: 'manage',
    description: 'Add/remove permissions from roles',
    isDelegatable: false,
  },
  {
    code: 'role.assign',
    resource: 'role',
    action: 'assign',
    description: 'Assign/revoke roles from users',
    isDelegatable: false,
  },

  // ── Reference data ────────────────────────────────────────────────────────
  {
    code: 'reference.manage',
    resource: 'reference',
    action: 'manage',
    description: 'Create/update/deactivate Subject, Grade, Curriculum entries',
    isDelegatable: false,
  },

  // ── Tutor recruitment ─────────────────────────────────────────────────────
  {
    code: 'tutor.recruitment.read',
    resource: 'tutor.recruitment',
    action: 'read',
    description: 'View recruitment records and history',
    isDelegatable: true,
  },
  {
    code: 'tutor.recruitment.create',
    resource: 'tutor.recruitment',
    action: 'create',
    description: 'Create a new tutor recruitment enquiry',
    isDelegatable: true,
  },
  {
    code: 'tutor.recruitment.manage',
    resource: 'tutor.recruitment',
    action: 'manage',
    description: 'Advance stages, record interviews, reject, hire',
    isDelegatable: true,
  },

  // ── Tutor profile ─────────────────────────────────────────────────────────
  {
    code: 'tutor.profile.read',
    resource: 'tutor.profile',
    action: 'read',
    description: 'View tutor profile, capability, and availability',
    isDelegatable: true,
  },
  {
    code: 'tutor.profile.manage',
    resource: 'tutor.profile',
    action: 'manage',
    description: 'Manage all HR-owned tutor profile fields',
    isDelegatable: true,
  },
  {
    code: 'tutor.rate.read',
    resource: 'tutor.rate',
    action: 'read',
    description: 'View tutor hourly rate records',
    isDelegatable: false,
  },
  {
    code: 'tutor.rate.manage',
    resource: 'tutor.rate',
    action: 'manage',
    description: 'Set or change tutor hourly rate (HR Manager only)',
    isDelegatable: false,
  },

  // ── Tutor self-service ────────────────────────────────────────────────────
  {
    code: 'tutor.self.update',
    resource: 'tutor.self',
    action: 'update',
    description: 'Tutor updates own permitted fields (bio, subjects, grades, availability)',
    isDelegatable: false,
  },

  // ── Tutor feedback ────────────────────────────────────────────────────────
  // isDelegatable = false: HR Assistant must NOT have access to feedback.
  // HR Manager cannot delegate this permission.
  {
    code: 'tutor.feedback.read',
    resource: 'tutor.feedback',
    action: 'read',
    description: 'Read internal tutor feedback (Mentor/Demo Coordinator notes)',
    isDelegatable: false,
  },
  {
    code: 'tutor.feedback.create',
    resource: 'tutor.feedback',
    action: 'create',
    description: 'Submit tutor feedback (Mentor and Demo Coordinator only)',
    isDelegatable: false,
  },

  // 🚀 Audit 🚀
  {
    code: 'audit.view',
    resource: 'audit',
    action: 'view',
    description: 'Read the audit log',
    isDelegatable: false,
  },
  {
    code: 'report.view',
    resource: 'report',
    action: 'view',
    description: 'View standard operational reports',
    isDelegatable: false,
  },
  {
    code: 'analytics.ceo.read',
    resource: 'analytics',
    action: 'read',
    description: 'View CEO Command Center executive analytics',
    isDelegatable: false,
  },
  {
    code: 'target.read.own',
    resource: 'target',
    action: 'read.own',
    description: 'Read own sales targets and progress',
    isDelegatable: false,
  },
  {
    code: 'target.read.team',
    resource: 'target',
    action: 'read.team',
    description: 'Read team sales targets and progress',
    isDelegatable: false,
  },
  {
    code: 'target.manage',
    resource: 'target',
    action: 'manage',
    description: 'Create or update sales targets for team members',
    isDelegatable: false,
  },

  // 🚀 CRM Phase 2A 🚀
  {
    code: 'lead.create',
    resource: 'lead',
    action: 'create',
    description: 'Create lead',
    isDelegatable: true,
  },
  {
    code: 'lead.read',
    resource: 'lead',
    action: 'read',
    description: 'Read assigned leads',
    isDelegatable: true,
  },
  {
    code: 'lead.read-all',
    resource: 'lead',
    action: 'read-all',
    description: 'Read all leads',
    isDelegatable: false,
  },
  {
    code: 'lead.update',
    resource: 'lead',
    action: 'update',
    description: 'Update lead',
    isDelegatable: true,
  },
  {
    code: 'lead.status.change',
    resource: 'lead',
    action: 'status.change',
    description: 'Change lead status',
    isDelegatable: true,
  },
  {
    code: 'lead.reassign',
    resource: 'lead',
    action: 'reassign',
    description: 'Reassign lead',
    isDelegatable: false,
  },
  {
    code: 'lead.archive',
    resource: 'lead',
    action: 'archive',
    description: 'Archive lead',
    isDelegatable: false,
  },
  {
    code: 'lead.reopen',
    resource: 'lead',
    action: 'reopen',
    description: 'Reopen lead',
    isDelegatable: false,
  },
  {
    code: 'lead.convert',
    resource: 'lead',
    action: 'convert',
    description: 'Convert lead',
    isDelegatable: false,
  },

  {
    code: 'followup.create',
    resource: 'followup',
    action: 'create',
    description: 'Create follow-up',
    isDelegatable: true,
  },
  {
    code: 'followup.read',
    resource: 'followup',
    action: 'read',
    description: 'Read follow-up',
    isDelegatable: true,
  },
  {
    code: 'followup.update',
    resource: 'followup',
    action: 'update',
    description: 'Update follow-up',
    isDelegatable: true,
  },
  {
    code: 'followup.complete',
    resource: 'followup',
    action: 'complete',
    description: 'Complete follow-up',
    isDelegatable: true,
  },
  {
    code: 'followup.reschedule',
    resource: 'followup',
    action: 'reschedule',
    description: 'Reschedule a follow-up (separately controlled from update)',
    isDelegatable: true,
  },
  {
    code: 'followup.read-all',
    resource: 'followup',
    action: 'read-all',
    description: 'View all follow-ups team-wide (Sales Head)',
    isDelegatable: false,
  },

  {
    code: 'salesnote.create',
    resource: 'salesnote',
    action: 'create',
    description: 'Create sales note',
    isDelegatable: true,
  },
  {
    code: 'salesnote.read',
    resource: 'salesnote',
    action: 'read',
    description: 'Read sales notes',
    isDelegatable: true,
  },
  {
    code: 'salesnote.update',
    resource: 'salesnote',
    action: 'update',
    description: 'Update sales note',
    isDelegatable: true,
  },
  {
    code: 'salesnote.delete',
    resource: 'salesnote',
    action: 'delete',
    description: 'Delete sales note',
    isDelegatable: true,
  },

  {
    code: 'student.create',
    resource: 'student',
    action: 'create',
    description: 'Create student',
    isDelegatable: true,
  },
  {
    code: 'student.read',
    resource: 'student',
    action: 'read',
    description: 'Read student',
    isDelegatable: true,
  },
  {
    code: 'student.update',
    resource: 'student',
    action: 'update',
    description: 'Update student',
    isDelegatable: true,
  },

  {
    code: 'requirement.create',
    resource: 'requirement',
    action: 'create',
    description: 'Create requirement',
    isDelegatable: true,
  },
  {
    code: 'requirement.read',
    resource: 'requirement',
    action: 'read',
    description: 'Read requirement',
    isDelegatable: true,
  },
  {
    code: 'requirement.update',
    resource: 'requirement',
    action: 'update',
    description: 'Update requirement',
    isDelegatable: true,
  },

  {
    code: 'demo.create',
    resource: 'demo',
    action: 'create',
    description: 'Create demo',
    isDelegatable: true,
  },
  {
    code: 'demo.read',
    resource: 'demo',
    action: 'read',
    description: 'Read demo',
    isDelegatable: true,
  },
  {
    code: 'demo.update',
    resource: 'demo',
    action: 'update',
    description: 'Update demo',
    isDelegatable: true,
  },

  {
    code: 'sales-routing.read',
    resource: 'sales-routing',
    action: 'read',
    description: 'Read sales routing',
    isDelegatable: false,
  },
  {
    code: 'sales-routing.manage',
    resource: 'sales-routing',
    action: 'manage',
    description: 'Manage sales routing',
    isDelegatable: false,
  },

  // 🚀 Reports (placeholder; extended per phase) 🚀
  {
    code: 'report.view',
    resource: 'report',
    action: 'view',
    description: 'View reports (scope extended per phase)',
    isDelegatable: false,
  },
];

// =============================================================================
// ROLE–PERMISSION ASSIGNMENTS (Phase 0–1)
//
// CO_FOUNDER: read/view only — matches its read-only requirement.
// CEO: all permissions.
// Others: as per Revision 3.1 RBAC matrix.
//
// HR Assistant has NO seeded permissions — all duties are individually delegated
// at runtime by HR Manager via the UserPermission mechanism.
// =============================================================================

const ALL_PERMISSION_CODES = PERMISSIONS.map((p) => p.code);

// Read-only permissions for Co-Founder — all *.read and *.view, no writes
const CO_FOUNDER_PERMISSIONS = PERMISSIONS.filter(
  (p) =>
    ['read', 'read-all', 'view'].includes(p.action) ||
    p.code === 'audit.view' ||
    p.code === 'report.view',
).map((p) => p.code);

const ROLE_PERMISSIONS: Record<string, string[]> = {
  CEO: ALL_PERMISSION_CODES,

  CO_FOUNDER: CO_FOUNDER_PERMISSIONS,

  OPERATIONS_MANAGER: [
    'attendance.action.own',
    'attendance.read.own','employee.read', 'employee.read-all', 'audit.view', 'report.view'],

  HR_MANAGER: [
    'attendance.action.own',
    'attendance.read.own',
    'attendance.read.team',
    'attendance.correct',
    'attendance.settings.manage',
    'user.read',
    'user.create',
    'user.update',
    'user.manage-status',
    'user.reset-password',
    'user.read-all',
    'employee.read',
    'employee.create',
    'employee.update',
    'employee.manage-status',
    'employee.read-all',
    'department.read',
    'role.read',
    'role.create',
    'role.manage',
    'role.assign',
    'tutor.recruitment.read',
    'tutor.recruitment.create',
    'tutor.recruitment.manage',
    'tutor.profile.read',
    'tutor.profile.manage',
    'tutor.rate.read',
    'tutor.rate.manage',
    'tutor.feedback.read',
    'audit.view',
  ],

  HR_EXECUTIVE: [
    'user.read',
    'user.create',
    'employee.read',
    'employee.create',
    'employee.update',
    'department.read',
    'role.read',
    'tutor.recruitment.read',
    'tutor.recruitment.create',
    'tutor.recruitment.manage',
    'tutor.profile.read',
    'tutor.profile.manage',
    // tutor.rate.read: NOT granted to HR Executive per Revision 3.1
    // tutor.feedback.read: NOT granted to HR Executive — HR Executive CAN read feedback
    'tutor.feedback.read',
  ],

  // HR_ASSISTANT: intentionally empty — duties delegated at runtime via UserPermission
  HR_ASSISTANT: [],

  MENTOR: [
    'employee.read', // scoped to Tutor-role employees at service layer
    'department.read',
    'tutor.profile.read', // scoped: no rate, no recruitment details
    'tutor.feedback.read',
    'tutor.feedback.create',
    'attendance.student.read',
      'attendance.tutor.read',
      'attendance.tutor.verify',
      'attendance.tutor.correct',
    ],

  DEMO_COORDINATOR: [
    'attendance.action.own',
    'attendance.read.own',
    'demo.manage_all',
    'demo.assign_tutor',
    'demo.read',
    'demo.mark_exceptions',
    'employee.read', // scoped to Tutor-role employees at service layer
    'department.read',
    'tutor.profile.read', // scoped: no rate, no recruitment details
    'tutor.feedback.read',
    'tutor.feedback.create',
  ],

  // TUTOR: self-service only — all access is scoped to their own profile at service layer
  TUTOR: [

    'demo.read_assigned',
    'demo.complete',
    'department.read',
    'tutor.self.update',
    'tutor.profile.read', // own profile only — service layer enforces ownership
    'attendance.student.read',
      'attendance.student.mark',
      'attendance.tutor.read',
      'attendance.tutor.mark',
    ],

  // The following roles will receive domain-specific permissions in later phases.
  // Seeded with minimal read access for now.
  ACADEMIC_HEAD: [
    'attendance.action.own',
    'attendance.read.own','employee.read', 'department.read', 'tutor.profile.read', 'tutor.feedback.read'],
  MARKETING_HEAD: [
    'attendance.action.own',
    'attendance.read.own','employee.read', 'department.read'],
  PERFORMANCE_MARKETER: [
    'attendance.action.own',
    'attendance.read.own','department.read'],
  DESIGNER: [
    'attendance.action.own',
    'attendance.read.own','department.read'],
  SALES_HEAD: [
    'attendance.action.own',
    'attendance.read.own',
    'attendance.read.team',
    'demo.book',
    'demo.read_own',
    'demo.manage_team','roundrobin.read', 'roundrobin.manage',
    'roundrobin.history.read.all',
    'roundrobin.history.read.team',
    'roundrobin.history.read.own',
    'target.read.own',
    'target.read.team',
    'target.manage',
    'god-view.enter',
    'employee.read',
    'department.read',
    'lead.create',
    'lead.read',
    'lead.read-all',
    'lead.update',
    'lead.status.change',
    'lead.reassign',
    'lead.archive',
    'lead.reopen',
    'lead.convert',
    'followup.create',
    'followup.read',
    'followup.read-all',
    'followup.update',
    'followup.complete',
    'followup.reschedule',
    'salesnote.create',
    'salesnote.read',
    'salesnote.update',
    'salesnote.delete',
    'student.create',
    'student.read',
    'student.update',
    'requirement.create',
    'requirement.read',
    'requirement.update',
    'demo.create',
    'demo.read',
    'demo.update',
    'sales-routing.read',
    'sales-routing.manage',
  ],
  SALES_COUNSELLOR: [
    'attendance.action.own',
    'attendance.read.own',

    'demo.book',
    'demo.read_own',
    'demo.cancel_own',
    'demo.reschedule_own',
    'target.read.own',
    'department.read',
    'lead.create',
    'lead.read',
    'lead.update',
    'lead.status.change',
    'followup.create',
    'followup.read',
    'followup.update',
    'followup.complete',
    'followup.reschedule',
    'salesnote.create',
    'salesnote.read',
    'salesnote.update',
    'salesnote.delete',
    'student.create',
    'student.read',
    'student.update',
    'requirement.create',
    'requirement.read',
    'requirement.update',
    'demo.create',
    'demo.read',
    'demo.update',
  ],
  FINANCE_HEAD: [
    'attendance.action.own',
    'attendance.read.own','employee.read', 'department.read'],
  FINANCE_MANAGER: [
    'finance.invoice.create',
    'finance.invoice.read',
    'finance.invoice.issue',
    'finance.invoice.void',
    'finance.payment.create',
    'finance.payment.read',
    'finance.payment.reverse',
    'finance.refund.request',
    'finance.refund.approve',
    'finance.refund.execute',
    'finance.refund.read',
    'finance.receipt.read',
    'finance.report.read'
  ],
  FINANCE_EXECUTIVE: [
    'attendance.action.own',
    'attendance.read.own',
    'finance.invoice.create',
    'finance.invoice.read',
    'finance.invoice.issue',
    'finance.payment.create',
    'finance.payment.read',
    'finance.refund.request',
    'finance.refund.read',
    'finance.receipt.read'
  ],
  ACCOUNTANT: ['department.read'],
};

// =============================================================================
// ID SEQUENCES
// =============================================================================

const SEQUENCES = [
  { entityType: 'STA', prefix: 'STA-', padding: 7 }, // Student Attendance
  { entityType: 'TCR', prefix: 'TCR-', padding: 7 }, // Tutor Class Record

  { entityType: 'EMP', prefix: 'EMP', padding: 4 },
  { entityType: 'REC', prefix: 'REC', padding: 4 }, // Tutor recruitment (new in Phase 1)
  { entityType: 'LED', prefix: 'LED', nextNumber: 1, padding: 4 }, // Lead
  { entityType: 'REQ', prefix: 'REQ', nextNumber: 1, padding: 4 }, // Requirement
  { entityType: 'STU', prefix: 'STU', padding: 4 },
  { entityType: 'FUP', prefix: 'FUP', nextNumber: 1, padding: 4 }, // FollowUp
  { entityType: 'DMO', prefix: 'DMO', nextNumber: 1, padding: 4 }, // Demo-ups (Slice 2B)
  { entityType: 'TUT', prefix: 'TUT', padding: 4 },
  { entityType: 'DEM', prefix: 'DEM', padding: 4 },
  { entityType: 'ADM', prefix: 'ADM', padding: 4 },
  { entityType: 'PAY', prefix: 'PAY', padding: 4 },
  { entityType: 'INV', prefix: 'INV', padding: 4 },
  { entityType: 'PMT', prefix: 'PMT', padding: 4 },
  { entityType: 'RCT', prefix: 'RCT', padding: 4 },
  { entityType: 'CLS', prefix: 'CLS', padding: 4 },
  { entityType: 'REN', prefix: 'REN', padding: 4 },
  { entityType: 'MTG', prefix: 'MTG', padding: 4 },
];

// =============================================================================
// REFERENCE DATA — Subject, Grade, Curriculum
//
// These are initial/starter entries. Administrators can add, update, and deactivate
// entries at runtime via the reference data management UI (reference.manage permission).
// This seed should not be the only source — it seeds enough to be usable on day one.
// =============================================================================

const SUBJECTS = [
  { code: 'ARABIC', name: 'Arabic' },
  { code: 'ENGLISH', name: 'English' },
  { code: 'MATH', name: 'Mathematics' },
  { code: 'SCIENCE', name: 'Science' },
  { code: 'PHYSICS', name: 'Physics' },
  { code: 'CHEMISTRY', name: 'Chemistry' },
  { code: 'BIOLOGY', name: 'Biology' },
  { code: 'HISTORY', name: 'History' },
  { code: 'GEOGRAPHY', name: 'Geography' },
  { code: 'ISLAMIYAT', name: 'Islamiyat' },
  { code: 'FRENCH', name: 'French' },
  { code: 'ACCOUNTING', name: 'Accounting' },
  { code: 'ECONOMICS', name: 'Economics' },
  { code: 'COMPUTER', name: 'Computer Science' },
  { code: 'ART', name: 'Art & Design' },
];

const GRADES: Array<{ code: string; name: string; sortOrder: number }> = [
  { code: 'KG', name: 'Kindergarten', sortOrder: 1 },
  { code: 'GRADE_1', name: 'Grade 1', sortOrder: 2 },
  { code: 'GRADE_2', name: 'Grade 2', sortOrder: 3 },
  { code: 'GRADE_3', name: 'Grade 3', sortOrder: 4 },
  { code: 'GRADE_4', name: 'Grade 4', sortOrder: 5 },
  { code: 'GRADE_5', name: 'Grade 5', sortOrder: 6 },
  { code: 'GRADE_6', name: 'Grade 6', sortOrder: 7 },
  { code: 'GRADE_7', name: 'Grade 7', sortOrder: 8 },
  { code: 'GRADE_8', name: 'Grade 8', sortOrder: 9 },
  { code: 'GRADE_9', name: 'Grade 9', sortOrder: 10 },
  { code: 'GRADE_10', name: 'Grade 10', sortOrder: 11 },
  { code: 'GRADE_11', name: 'Grade 11', sortOrder: 12 },
  { code: 'GRADE_12', name: 'Grade 12', sortOrder: 13 },
  { code: 'O_LEVEL', name: 'O Level', sortOrder: 14 },
  { code: 'A_LEVEL', name: 'A Level', sortOrder: 15 },
  { code: 'IB_MYP', name: 'IB MYP', sortOrder: 16 },
  { code: 'IB_DP', name: 'IB Diploma', sortOrder: 17 },
];

const CURRICULA = [
  { code: 'CBSE', name: 'CBSE' },
  { code: 'IGCSE', name: 'Cambridge IGCSE' },
  { code: 'A_LEVEL', name: 'Cambridge A Level' },
  { code: 'IB', name: 'International Baccalaureate (IB)' },
  { code: 'MINISTRY', name: 'UAE Ministry Curriculum' },
  { code: 'AMERICAN', name: 'American Curriculum' },
];

// =============================================================================
// SEED FUNCTIONS
// =============================================================================

async function seedDepartments() {
  console.log('  Seeding departments...');
  for (const dept of DEPARTMENTS) {
    await prisma.department.upsert({
      where: { code: dept.code },
      update: { name: dept.name },
      create: dept,
    });
  }
}

async function seedRoles() {
  console.log('  Seeding roles...');
  for (const role of ROLES) {
    await prisma.role.upsert({
      where: { code: role.code },
      update: {
        name: role.name,
        description: role.description,
        isSystem: role.isSystem,
        isProtected: role.isProtected,
        isCustom: role.isCustom,
      },
      create: {
        code: role.code,
        name: role.name,
        description: role.description,
        isSystem: role.isSystem,
        isProtected: role.isProtected,
        isCustom: role.isCustom,
      },
    });
  }
}

async function seedPermissions() {
  console.log('  Seeding permissions...');
  for (const perm of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code: perm.code },
      update: {
        resource: perm.resource,
        action: perm.action,
        description: perm.description,
        isDelegatable: perm.isDelegatable,
      },
      create: {
        code: perm.code,
        resource: perm.resource,
        action: perm.action,
        description: perm.description,
        isDelegatable: perm.isDelegatable,
      },
    });
  }
}

async function seedRolePermissions() {
  console.log('  Seeding role–permission assignments...');
  for (const [roleCode, permCodes] of Object.entries(ROLE_PERMISSIONS)) {
    const role = await prisma.role.findUniqueOrThrow({ where: { code: roleCode } });
    for (const permCode of permCodes) {
      const perm = await prisma.permission.findUniqueOrThrow({ where: { code: permCode } });
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } },
        update: {},
        create: { roleId: role.id, permissionId: perm.id },
      });
    }
  }
}

async function seedSequences() {
  console.log('  Seeding ID sequences...');
  for (const seq of SEQUENCES) {
    await prisma.sequence.upsert({
      where: { entityType: seq.entityType },
      update: { prefix: seq.prefix, padding: seq.padding },
      create: { ...seq, nextNumber: 1 },
    });
  }
}

async function seedReferenceData() {
  console.log('  Seeding reference data (subjects, grades, curricula)...');

  for (const subject of SUBJECTS) {
    await prisma.subject.upsert({
      where: { code: subject.code },
      update: { name: subject.name },
      create: { code: subject.code, name: subject.name, isActive: true },
    });
  }

  for (const grade of GRADES) {
    await prisma.grade.upsert({
      where: { code: grade.code },
      update: { name: grade.name, sortOrder: grade.sortOrder },
      create: { code: grade.code, name: grade.name, sortOrder: grade.sortOrder, isActive: true },
    });
  }

  for (const curriculum of CURRICULA) {
    await prisma.curriculum.upsert({
      where: { code: curriculum.code },
      update: { name: curriculum.name },
      create: { code: curriculum.code, name: curriculum.name, isActive: true },
    });
  }
}

async function seedAdminUser() {
  console.log('  Seeding initial admin user...');

  // Only create the seed admin if no users exist yet
  const existingUserCount = await prisma.user.count();
  if (existingUserCount > 0) {
    console.log('    Admin user already exists — skipping.');
    return;
  }

  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@elscore.internal';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe123!';

  if (adminPassword === 'ChangeMe123!' && process.env.NODE_ENV === 'production') {
    throw new Error(
      'SEED_ADMIN_PASSWORD must be set to a strong password in production. ' +
        'Set the environment variable before running the seed.',
    );
  }

  const passwordHash = await argon2.hash(adminPassword, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });

  const adminDept = await prisma.department.findUniqueOrThrow({ where: { code: 'ADMIN' } });
  const ceoRole = await prisma.role.findUniqueOrThrow({ where: { code: 'CEO' } });

  const user = await prisma.user.create({
    data: {
      email: adminEmail,
      passwordHash,
      status: UserStatus.ACTIVE,
      mustChangePassword: false, // admin sets their own password via seed env var
      userRoles: {
        create: { roleId: ceoRole.id },
      },
    },
  });

  // Generate EMP-#### business ID
  const seq = await prisma.sequence.update({
    where: { entityType: 'EMP' },
    data: { nextNumber: { increment: 1 } },
  });
  const businessId = `EMP-${String(seq.nextNumber - 1).padStart(4, '0')}`;

  await prisma.employee.create({
    data: {
      businessId,
      userId: user.id,
      departmentId: adminDept.id,
      employmentStatus: EmploymentStatus.ACTIVE,
      firstName: 'System',
      lastName: 'Admin',
    },
  });

  console.log(`    Admin user created: ${adminEmail} — Employee ID: ${businessId}`);
  console.log('    ⚠️  Change the admin password immediately after first login.');
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  console.log('🌱 Starting EL SCORE OS Phase 1 database seed...');
  await seedDepartments();
  await seedRoles();
  await seedPermissions();
  await seedRolePermissions();
  await seedSequences();
  await seedReferenceData();
  await seedAdminUser();
  await seedSystemUser();
  console.log('✅ Seed complete.');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

async function seedSystemUser() {
  console.log('  Seeding SYSTEM user...');
  const adminDept = await prisma.department.findUniqueOrThrow({ where: { code: 'ADMIN' } });
  const ceoRole = await prisma.role.findUniqueOrThrow({ where: { code: 'CEO' } });
  
  await prisma.user.upsert({
    where: { email: 'system@elscore.internal' },
    update: {},
    create: {
      id: 'SYSTEM',
      email: 'system@elscore.internal',
      passwordHash: 'none',
      status: 'ACTIVE',
      userRoles: {
        create: [{ roleId: ceoRole.id }]
      },
      employee: {
        create: {
          businessId: 'SYS-0000',
          departmentId: adminDept.id,
          employmentStatus: 'ACTIVE',
          firstName: 'System',
          lastName: 'Automated'
        }
      }
    }
  });
}

