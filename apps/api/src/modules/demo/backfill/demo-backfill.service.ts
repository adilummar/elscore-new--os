import { Injectable, Logger } from '@nestjs/common';
import {
  DemoStatus,
  DemoBookingStatus,
  DemoSessionStatus,
  TutorAssignmentStatus,
} from '@prisma/client';
import { v5 as uuidv5 } from 'uuid';

import { PrismaService } from '../../../common/prisma/prisma.service';

/**
 * Standard RFC 4122 DNS namespace UUID for deterministic UUIDv5 generation
 */
export const DEMO_BACKFILL_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

export interface OrphanReport {
  demoId: string;
  businessId: string;
  reason:
    | 'MISSING_STUDENT'
    | 'MISSING_LEAD'
    | 'MISSING_REQUIREMENT'
    | 'MISSING_SUBJECT'
    | 'MISSING_CURRICULUM'
    | 'MISSING_GRADE'
    | 'MISSING_BOOKED_BY_USER'
    | 'MISSING_TUTOR';
  missingReferenceId: string;
}

export interface ConflictReport {
  demoId: string;
  businessId: string;
  existingBookingId: string;
  mismatches: Array<{
    field: string;
    legacyValue: any;
    existingBookingValue: any;
  }>;
}

export interface BackfillReport {
  status: 'SUCCESS' | 'DRY_RUN_COMPLETED' | 'HALTED_CONFLICTS' | 'ERROR';
  isDryRun: boolean;
  totalLegacyDemos: number;
  eligibleDemos: number;
  alreadyBackfilled: number;
  newlyBackfilled: number;
  tutorAssignmentsCreated: number;
  feedbackRecordsMigrated: number;
  rescheduleHistoriesMigrated: number;
  orphans: OrphanReport[];
  conflicts: ConflictReport[];
  errors: Array<{ demoId?: string; error: string }>;
  durationMs: number;
}

@Injectable()
export class DemoBackfillService {
  private readonly logger = new Logger(DemoBackfillService.name);

  constructor(private readonly prisma?: PrismaService) {}

  /**
   * Deterministic ID Generators using UUIDv5
   */
  generateDeterministicBookingId(legacyDemoId: string): string {
    // Booking inherits legacy demo ID directly to preserve cross-system references
    return legacyDemoId;
  }

  generateDeterministicSessionId(legacyDemoId: string, order: number = 1): string {
    return uuidv5(`${legacyDemoId}:session:${order}`, DEMO_BACKFILL_NAMESPACE);
  }

  generateDeterministicAssignmentId(legacyDemoId: string, sequence: number = 1): string {
    return uuidv5(`${legacyDemoId}:assignment:${sequence}`, DEMO_BACKFILL_NAMESPACE);
  }

  generateDeterministicFeedbackId(legacyDemoId: string): string {
    return uuidv5(`${legacyDemoId}:feedback`, DEMO_BACKFILL_NAMESPACE);
  }

  generateDeterministicRescheduleId(legacyRescheduleId: string): string {
    return uuidv5(`${legacyRescheduleId}:reschedule`, DEMO_BACKFILL_NAMESPACE);
  }

  /**
   * Maps legacy DemoStatus to DemoBookingStatus
   */
  mapBookingStatus(legacyStatus: DemoStatus): DemoBookingStatus {
    switch (legacyStatus) {
      case DemoStatus.SCHEDULED:
        return DemoBookingStatus.SCHEDULED;
      case DemoStatus.ASSIGNED:
        return DemoBookingStatus.ASSIGNED;
      case DemoStatus.COMPLETED:
        return DemoBookingStatus.COMPLETED;
      case DemoStatus.NO_SHOW:
        return DemoBookingStatus.NO_SHOW;
      case DemoStatus.CANCELLED:
        return DemoBookingStatus.CANCELLED;
      default:
        return DemoBookingStatus.SCHEDULED;
    }
  }

  /**
   * Maps legacy DemoStatus to DemoSessionStatus
   */
  mapSessionStatus(legacyStatus: DemoStatus): DemoSessionStatus {
    switch (legacyStatus) {
      case DemoStatus.SCHEDULED:
        return DemoSessionStatus.SCHEDULED;
      case DemoStatus.ASSIGNED:
        return DemoSessionStatus.ASSIGNED;
      case DemoStatus.COMPLETED:
        return DemoSessionStatus.COMPLETED;
      case DemoStatus.NO_SHOW:
        return DemoSessionStatus.NO_SHOW;
      case DemoStatus.CANCELLED:
        return DemoSessionStatus.CANCELLED;
      default:
        return DemoSessionStatus.SCHEDULED;
    }
  }

  /**
   * Preflight validation logic: detects orphans and conflicting existing mappings.
   */
  validatePreflight(
    legacyDemos: any[],
    existingBookingsInput:
      | Map<string, any>
      | {
          byLegacyId: Map<string, any>;
          byBusinessId?: Map<string, any>;
          byId?: Map<string, any>;
        },
    lookupTables: {
      students: Map<string, any>;
      leads: Map<string, any>;
      requirements: Map<string, any>;
      subjects: Map<string, any>;
      curricula: Map<string, any>;
      grades: Map<string, any>;
      users: Map<string, any>;
    },
  ): {
    eligibleDemos: any[];
    orphans: OrphanReport[];
    conflicts: ConflictReport[];
    alreadyBackfilledIds: Set<string>;
  } {
    const orphans: OrphanReport[] = [];
    const conflicts: ConflictReport[] = [];
    const eligibleDemos: any[] = [];
    const alreadyBackfilledIds = new Set<string>();

    const byLegacyId =
      existingBookingsInput instanceof Map
        ? existingBookingsInput
        : existingBookingsInput.byLegacyId;
    const byBusinessId =
      existingBookingsInput instanceof Map
        ? undefined
        : existingBookingsInput.byBusinessId;
    const byId =
      existingBookingsInput instanceof Map ? undefined : existingBookingsInput.byId;

    for (const demo of legacyDemos) {
      let isOrphan = false;

      // 1. Verify Student Reference
      const student = lookupTables.students.get(demo.studentId);
      if (!student) {
        orphans.push({
          demoId: demo.id,
          businessId: demo.businessId,
          reason: 'MISSING_STUDENT',
          missingReferenceId: demo.studentId,
        });
        isOrphan = true;
      } else {
        // Verify Student's Lead Reference
        const lead = lookupTables.leads.get(student.leadId);
        if (!lead) {
          orphans.push({
            demoId: demo.id,
            businessId: demo.businessId,
            reason: 'MISSING_LEAD',
            missingReferenceId: student.leadId,
          });
          isOrphan = true;
        }
      }

      // 2. Verify Requirement Reference
      if (!lookupTables.requirements.has(demo.requirementId)) {
        orphans.push({
          demoId: demo.id,
          businessId: demo.businessId,
          reason: 'MISSING_REQUIREMENT',
          missingReferenceId: demo.requirementId,
        });
        isOrphan = true;
      }

      // 3. Verify Academic References
      if (!lookupTables.subjects.has(demo.subjectId)) {
        orphans.push({
          demoId: demo.id,
          businessId: demo.businessId,
          reason: 'MISSING_SUBJECT',
          missingReferenceId: demo.subjectId,
        });
        isOrphan = true;
      }

      if (!lookupTables.curricula.has(demo.curriculumId)) {
        orphans.push({
          demoId: demo.id,
          businessId: demo.businessId,
          reason: 'MISSING_CURRICULUM',
          missingReferenceId: demo.curriculumId,
        });
        isOrphan = true;
      }

      if (!lookupTables.grades.has(demo.gradeId)) {
        orphans.push({
          demoId: demo.id,
          businessId: demo.businessId,
          reason: 'MISSING_GRADE',
          missingReferenceId: demo.gradeId,
        });
        isOrphan = true;
      }

      // 4. Verify BookedByUser Reference
      if (!lookupTables.users.has(demo.bookedByUserId)) {
        orphans.push({
          demoId: demo.id,
          businessId: demo.businessId,
          reason: 'MISSING_BOOKED_BY_USER',
          missingReferenceId: demo.bookedByUserId,
        });
        isOrphan = true;
      }

      // 5. Verify Tutor Reference (if assigned)
      if (demo.tutorId && !lookupTables.users.has(demo.tutorId)) {
        orphans.push({
          demoId: demo.id,
          businessId: demo.businessId,
          reason: 'MISSING_TUTOR',
          missingReferenceId: demo.tutorId,
        });
        isOrphan = true;
      }

      if (isOrphan) {
        continue;
      }

      // 6a. Check Business ID collision with a booking belonging to another legacy demo or non-legacy booking
      if (byBusinessId) {
        const existingByBusinessId = byBusinessId.get(demo.businessId);
        if (existingByBusinessId && existingByBusinessId.legacyDemoId !== demo.id) {
          conflicts.push({
            demoId: demo.id,
            businessId: demo.businessId,
            existingBookingId: existingByBusinessId.id,
            mismatches: [
              {
                field: 'businessId',
                legacyValue: demo.businessId,
                existingBookingValue: `Already occupied by booking ${existingByBusinessId.id} (legacyDemoId: ${existingByBusinessId.legacyDemoId || 'none'})`,
              },
            ],
          });
          continue;
        }
      }

      // 6b. Check Primary Key collision with a booking belonging to another legacy demo or non-legacy booking
      if (byId) {
        const existingById = byId.get(demo.id);
        if (existingById && existingById.legacyDemoId !== demo.id) {
          conflicts.push({
            demoId: demo.id,
            businessId: demo.businessId,
            existingBookingId: existingById.id,
            mismatches: [
              {
                field: 'id',
                legacyValue: demo.id,
                existingBookingValue: `Already occupied by booking ${existingById.id} (legacyDemoId: ${existingById.legacyDemoId || 'none'})`,
              },
            ],
          });
          continue;
        }
      }

      // 6c. Check existing booking mapping consistency when already mapped
      const existing = byLegacyId.get(demo.id);
      if (existing) {
        const mismatches: Array<{ field: string; legacyValue: any; existingBookingValue: any }> = [];
        const expectedLeadId = student?.leadId;

        if (existing.studentId !== demo.studentId) {
          mismatches.push({
            field: 'studentId',
            legacyValue: demo.studentId,
            existingBookingValue: existing.studentId,
          });
        }
        if (existing.leadId !== expectedLeadId) {
          mismatches.push({
            field: 'leadId',
            legacyValue: expectedLeadId,
            existingBookingValue: existing.leadId,
          });
        }
        if (existing.businessId !== demo.businessId) {
          mismatches.push({
            field: 'businessId',
            legacyValue: demo.businessId,
            existingBookingValue: existing.businessId,
          });
        }
        const legacyDateMs = new Date(demo.scheduledAt).getTime();
        const existingDateMs = new Date(existing.scheduledDate).getTime();
        if (legacyDateMs !== existingDateMs) {
          mismatches.push({
            field: 'scheduledDate',
            legacyValue: demo.scheduledAt,
            existingBookingValue: existing.scheduledDate,
          });
        }

        if (mismatches.length > 0) {
          conflicts.push({
            demoId: demo.id,
            businessId: demo.businessId,
            existingBookingId: existing.id,
            mismatches,
          });
          continue;
        }

        alreadyBackfilledIds.add(demo.id);
      }

      eligibleDemos.push({
        ...demo,
        resolvedLeadId: student.leadId,
      });
    }

    return {
      eligibleDemos,
      orphans,
      conflicts,
      alreadyBackfilledIds,
    };
  }

  /**
   * Plan or execute the backfill with dry-run support
   */
  async runBackfill(options: { dryRun?: boolean; batchSize?: number } = {}): Promise<BackfillReport> {
    const startTime = Date.now();
    const isDryRun = options.dryRun ?? true;

    if (!this.prisma) {
      throw new Error('PrismaService is required for database backfill execution');
    }

    // 1. Fetch all legacy demos with related feedback and reschedule history
    const legacyDemos = await this.prisma.demo.findMany({
      include: {
        feedback: true,
        rescheduleHistory: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    // 2. Fetch all existing demo bookings to detect collisions and prior mappings
    let existingBookings: any[] = [];
    try {
      existingBookings = await this.prisma.demoBooking.findMany();
    } catch (e: any) {
      if (e?.code === 'P2021') {
        this.logger.warn('Table demo_bookings does not exist yet; existing bookings treated as empty.');
      } else {
        throw e;
      }
    }
    const existingBookingsByLegacyId = new Map<string, any>();
    const existingBookingsByBusinessId = new Map<string, any>();
    const existingBookingsById = new Map<string, any>();

    for (const b of existingBookings) {
      if (b.legacyDemoId) {
        existingBookingsByLegacyId.set(b.legacyDemoId, b);
      }
      existingBookingsByBusinessId.set(b.businessId, b);
      existingBookingsById.set(b.id, b);
    }

    // 3. Load reference lookup tables for preflight validation
    const [students, leads, requirements, subjects, curricula, grades, users] = await Promise.all([
      this.prisma.student.findMany({ select: { id: true, leadId: true } }),
      this.prisma.lead.findMany({ select: { id: true } }),
      this.prisma.requirement.findMany({ select: { id: true } }),
      this.prisma.subject.findMany({ select: { id: true } }),
      this.prisma.curriculum.findMany({ select: { id: true } }),
      this.prisma.grade.findMany({ select: { id: true } }),
      this.prisma.user.findMany({ select: { id: true } }),
    ]);

    const lookupTables = {
      students: new Map(students.map((s) => [s.id, s])),
      leads: new Map(leads.map((l) => [l.id, l])),
      requirements: new Map(requirements.map((r) => [r.id, r])),
      subjects: new Map(subjects.map((s) => [s.id, s])),
      curricula: new Map(curricula.map((c) => [c.id, c])),
      grades: new Map(grades.map((g) => [g.id, g])),
      users: new Map(users.map((u) => [u.id, u])),
    };

    // 4. Run Preflight
    const { eligibleDemos, orphans, conflicts, alreadyBackfilledIds } = this.validatePreflight(
      legacyDemos,
      {
        byLegacyId: existingBookingsByLegacyId,
        byBusinessId: existingBookingsByBusinessId,
        byId: existingBookingsById,
      },
      lookupTables,
    );

    // If mapping conflicts are detected, halt immediately with diagnostic report
    if (conflicts.length > 0) {
      return {
        status: 'HALTED_CONFLICTS',
        isDryRun,
        totalLegacyDemos: legacyDemos.length,
        eligibleDemos: eligibleDemos.length,
        alreadyBackfilled: alreadyBackfilledIds.size,
        newlyBackfilled: 0,
        tutorAssignmentsCreated: 0,
        feedbackRecordsMigrated: 0,
        rescheduleHistoriesMigrated: 0,
        orphans,
        conflicts,
        errors: [{ error: `Halted due to ${conflicts.length} conflicting booking mapping(s)` }],
        durationMs: Date.now() - startTime,
      };
    }

    // Determine records needing migration
    const pendingDemos = eligibleDemos.filter((d) => !alreadyBackfilledIds.has(d.id));

    let tutorAssignmentsCount = 0;
    let feedbackRecordsCount = 0;
    let rescheduleHistoriesCount = 0;

    for (const demo of pendingDemos) {
      if (demo.tutorId) tutorAssignmentsCount++;
      if (demo.feedback) feedbackRecordsCount++;
      if (demo.rescheduleHistory) rescheduleHistoriesCount += demo.rescheduleHistory.length;
    }

    // If dry run, return planned counts without mutating DB
    if (isDryRun) {
      return {
        status: 'DRY_RUN_COMPLETED',
        isDryRun: true,
        totalLegacyDemos: legacyDemos.length,
        eligibleDemos: eligibleDemos.length,
        alreadyBackfilled: alreadyBackfilledIds.size,
        newlyBackfilled: pendingDemos.length,
        tutorAssignmentsCreated: tutorAssignmentsCount,
        feedbackRecordsMigrated: feedbackRecordsCount,
        rescheduleHistoriesMigrated: rescheduleHistoriesCount,
        orphans,
        conflicts,
        errors: [],
        durationMs: Date.now() - startTime,
      };
    }

    // 5. Execution (Batched Transactions)
    const batchSize = options.batchSize || 50;
    let newlyBackfilled = 0;
    let actualAssignments = 0;
    let actualFeedbacks = 0;
    let actualReschedules = 0;
    const errors: Array<{ demoId?: string; error: string }> = [];

    for (let i = 0; i < pendingDemos.length; i += batchSize) {
      const batch = pendingDemos.slice(i, i + batchSize);

      try {
        await this.prisma.$transaction(async (tx) => {
          for (const demo of batch) {
            const bookingId = this.generateDeterministicBookingId(demo.id);
            const sessionId = this.generateDeterministicSessionId(demo.id, 1);
            const scheduledStart = new Date(demo.scheduledAt);
            const scheduledEnd = new Date(scheduledStart.getTime() + demo.durationMinutes * 60000);

            // A. Create DemoBooking (never fabricate coordinator)
            await tx.demoBooking.create({
              data: {
                id: bookingId,
                businessId: demo.businessId,
                studentId: demo.studentId,
                leadId: demo.resolvedLeadId,
                coordinatorId: null, // Honest: no coordinator was assigned in legacy system
                bookedByUserId: demo.bookedByUserId,
                status: this.mapBookingStatus(demo.status),
                scheduledDate: scheduledStart,
                totalDurationMin: demo.durationMinutes,
                legacyDemoId: demo.id,
                cancelledAt: demo.cancelledAt,
                cancelReason: demo.cancelReason,
                createdAt: demo.createdAt,
                updatedAt: demo.updatedAt,
              },
            });

            // B. Create Child DemoSession
            await tx.demoSession.create({
              data: {
                id: sessionId,
                bookingId,
                sessionOrder: 1,
                requirementId: demo.requirementId,
                subjectId: demo.subjectId,
                curriculumId: demo.curriculumId,
                gradeId: demo.gradeId,
                status: this.mapSessionStatus(demo.status),
                scheduledStart,
                scheduledEnd,
                durationMinutes: demo.durationMinutes,
                createdAt: demo.createdAt,
                updatedAt: demo.updatedAt,
              },
            });

            // C. Create Tutor Assignment if tutor assigned
            if (demo.tutorId) {
              const assignmentId = this.generateDeterministicAssignmentId(demo.id, 1);
              await tx.demoSessionTutorAssignment.create({
                data: {
                  id: assignmentId,
                  sessionId,
                  tutorId: demo.tutorId,
                  assignmentSequence: 1,
                  status: TutorAssignmentStatus.ACTIVE,
                  assignedAt: demo.createdAt,
                  assignedByUserId: demo.bookedByUserId,
                },
              });
              actualAssignments++;
            }

            // D. Migrate Feedback Record (only legacy rating/comments; no fabricated rubric)
            if (demo.feedback) {
              const feedbackId = this.generateDeterministicFeedbackId(demo.id);
              await tx.demoFeedbackRecord.create({
                data: {
                  id: feedbackId,
                  bookingId,
                  rating: demo.feedback.rating,
                  comments: demo.feedback.comments,
                  studentPerformance: null,
                  strengths: null,
                  weaknesses: null,
                  tutorRecommendations: null,
                  tutorRating: null,
                  academicAssessment: null,
                  engagementLevel: null,
                  learningBehaviour: null,
                  coordinatorRemarks: null,
                  parentFeedback: null,
                  parentConcerns: null,
                  parentInterestLevel: null,
                  submittedByUserId: demo.feedback.submittedByUserId,
                  submittedAt: demo.feedback.submittedAt,
                },
              });
              actualFeedbacks++;
            }

            // E. Migrate Reschedule History
            if (demo.rescheduleHistory && demo.rescheduleHistory.length > 0) {
              for (const h of demo.rescheduleHistory) {
                const historyId = this.generateDeterministicRescheduleId(h.id);
                await tx.demoBookingRescheduleHistory.create({
                  data: {
                    id: historyId,
                    bookingId,
                    previousDate: h.previousScheduledAt,
                    newDate: h.newScheduledAt,
                    reason: h.reason,
                    rescheduledByUserId: h.rescheduledByUserId,
                    rescheduledAt: h.rescheduledAt,
                  },
                });
                actualReschedules++;
              }
            }

            newlyBackfilled++;
          }
        });
      } catch (err: any) {
        this.logger.error(`Batch transaction failed during backfill: ${err.message}`, err.stack);
        for (const demo of batch) {
          errors.push({ demoId: demo.id, error: err.message });
        }
      }
    }

    // 6. Postflight Reconciliation
    const postflightTotal = await this.prisma.demoBooking.count({
      where: { legacyDemoId: { not: null } },
    });

    const expectedTotal = alreadyBackfilledIds.size + newlyBackfilled;
    if (postflightTotal !== expectedTotal) {
      errors.push({
        error: `Postflight count mismatch: expected ${expectedTotal} demo bookings with legacyDemoId, found ${postflightTotal}`,
      });
    }

    return {
      status: errors.length > 0 ? 'ERROR' : 'SUCCESS',
      isDryRun: false,
      totalLegacyDemos: legacyDemos.length,
      eligibleDemos: eligibleDemos.length,
      alreadyBackfilled: alreadyBackfilledIds.size,
      newlyBackfilled,
      tutorAssignmentsCreated: actualAssignments,
      feedbackRecordsMigrated: actualFeedbacks,
      rescheduleHistoriesMigrated: actualReschedules,
      orphans,
      conflicts,
      errors,
      durationMs: Date.now() - startTime,
    };
  }
}
