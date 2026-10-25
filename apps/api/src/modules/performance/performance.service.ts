import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  GoalStatus,
  PerformanceCycle,
  PerformanceCycleStatus,
  PerformanceImprovementPlan,
  PerformanceReview,
  PerformanceReviewStatus,
  PerformanceReviewType,
  PipObjectiveStatus,
  PipStatus,
  ReviewAcknowledgementStatus,
} from '@prisma/client';

import { AuditService } from '../../common/audit/audit.service';
import { IdGeneratorService } from '../../common/id-generator/id-generator.service';
import { PrismaService, PrismaTxClient } from '../../common/prisma/prisma.service';
import { isValidCalendarDate } from '../../common/utils/calendar-date.util';
import {
  AcknowledgePerformanceReviewDto,
  AmendPerformanceReviewDto,
  CreateEmployeeGoalDto,
  CreatePerformanceCycleDto,
  CreatePerformanceReviewDto,
  CreatePipDto,
  EvaluatePerformanceReviewDto,
  FinalizePerformanceReviewDto,
  QueryCyclesDto,
  QueryGoalsDto,
  QueryPerformanceReviewsDto,
  QueryPipsDto,
  TransitionPipStatusDto,
  UpdateEmployeeGoalDto,
  UpdatePerformanceCycleDto,
  UpdatePipDto,
  UpdateSelfReviewDto,
} from './dto';

@Injectable()
export class PerformanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly idGenerator: IdGeneratorService,
  ) {}

  /**
   * Helper to acquire sorted advisory locks on string keys to prevent deadlocks.
   */
  private async acquireSortedLocks(tx: PrismaTxClient, ...keys: string[]): Promise<void> {
    const sorted = [...keys].sort();
    for (const key of sorted) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
    }
  }

  /**
   * Sanitizes confidential notes from performance review.
   * In compliance with Section 9.8 & 9.11:
   * "Confidential internal management notes must remain restricted."
   * Only authorized organization-wide readers (CEO, HR Manager with performance.read.all)
   * or the designated evaluator/reviewer (when not reviewing themselves) are permitted to see confidential notes.
   * When viewed by the employee themselves, or by team leads/department heads who are not the designated reviewer,
   * confidentialNotes is strictly redacted server-side.
   */
  private sanitizeReview(
    review: PerformanceReview & {
      employee?: { userId?: string | null } | null;
      reviewer?: { userId?: string | null } | null;
    },
    actorUserId: string,
    hasOrgWideRead = false,
  ): PerformanceReview {
    const isEmployeeHimself = review.employee?.userId === actorUserId;
    const isDesignatedReviewer = review.reviewer?.userId === actorUserId;

    const canSeeConfidentialNotes =
      !isEmployeeHimself && (hasOrgWideRead || isDesignatedReviewer);

    if (!canSeeConfidentialNotes) {
      const sanitized = { ...review };
      sanitized.confidentialNotes = null;
      return sanitized;
    }
    return review;
  }

  // ===========================================================================
  // 1. PERFORMANCE REVIEW CYCLES
  // ===========================================================================

  async createCycle(
    dto: CreatePerformanceCycleDto,
    actorUserId: string,
  ): Promise<PerformanceCycle> {
    if (!isValidCalendarDate(dto.startDate)) {
      throw new BadRequestException('startDate must be a valid calendar date in YYYY-MM-DD format');
    }
    if (!isValidCalendarDate(dto.endDate)) {
      throw new BadRequestException('endDate must be a valid calendar date in YYYY-MM-DD format');
    }
    if (!isValidCalendarDate(dto.dueDate)) {
      throw new BadRequestException('dueDate must be a valid calendar date in YYYY-MM-DD format');
    }
    if (dto.startDate > dto.endDate) {
      throw new BadRequestException('startDate cannot be after endDate');
    }
    if (dto.endDate > dto.dueDate) {
      throw new BadRequestException('dueDate cannot be before endDate');
    }

    return this.prisma.$transaction(async (tx) => {
      await this.acquireSortedLocks(tx, `performance-cycle-${dto.name.trim()}`);

      const cycleCode = await this.idGenerator.nextIdInTx(tx, 'CYC');

      const cycle = await tx.performanceCycle.create({
        data: {
          cycleCode,
          name: dto.name.trim(),
          reviewType: dto.reviewType ?? PerformanceReviewType.MONTHLY,
          startDate: dto.startDate,
          endDate: dto.endDate,
          dueDate: dto.dueDate,
          departmentId: dto.departmentId ?? null,
          createdById: actorUserId,
          status: PerformanceCycleStatus.DRAFT,
        },
      });

      await this.auditService.recordInTx(tx, {
        entityType: 'PerformanceCycle',
        entityId: cycle.id,
        action: 'PERFORMANCE_CYCLE_CREATED',
        actorUserId,
        newValue: { cycleCode, name: cycle.name, status: cycle.status },
        reason: 'Performance review cycle created',
      });

      return cycle;
    });
  }

  async updateCycle(
    id: string,
    dto: UpdatePerformanceCycleDto,
    actorUserId: string,
  ): Promise<PerformanceCycle> {
    return this.prisma.$transaction(async (tx) => {
      const cycle = await tx.performanceCycle.findUnique({ where: { id } });
      if (!cycle) {
        throw new NotFoundException(`Performance cycle ${id} not found`);
      }

      const startDate = dto.startDate ?? cycle.startDate;
      const endDate = dto.endDate ?? cycle.endDate;
      const dueDate = dto.dueDate ?? cycle.dueDate;

      if (dto.startDate && !isValidCalendarDate(dto.startDate)) {
        throw new BadRequestException('startDate must be a valid calendar date (YYYY-MM-DD)');
      }
      if (dto.endDate && !isValidCalendarDate(dto.endDate)) {
        throw new BadRequestException('endDate must be a valid calendar date (YYYY-MM-DD)');
      }
      if (dto.dueDate && !isValidCalendarDate(dto.dueDate)) {
        throw new BadRequestException('dueDate must be a valid calendar date (YYYY-MM-DD)');
      }
      if (startDate > endDate) {
        throw new BadRequestException('startDate cannot be after endDate');
      }
      if (endDate > dueDate) {
        throw new BadRequestException('dueDate cannot be before endDate');
      }

      const updated = await tx.performanceCycle.update({
        where: { id },
        data: {
          ...(dto.name ? { name: dto.name.trim() } : {}),
          ...(dto.status ? { status: dto.status } : {}),
          ...(dto.startDate ? { startDate: dto.startDate } : {}),
          ...(dto.endDate ? { endDate: dto.endDate } : {}),
          ...(dto.dueDate ? { dueDate: dto.dueDate } : {}),
        },
      });

      await this.auditService.recordInTx(tx, {
        entityType: 'PerformanceCycle',
        entityId: id,
        action: 'PERFORMANCE_CYCLE_UPDATED',
        actorUserId,
        oldValue: { status: cycle.status, name: cycle.name },
        newValue: { status: updated.status, name: updated.name },
        reason: 'Performance review cycle updated',
      });

      return updated;
    });
  }

  async getCycleById(id: string): Promise<PerformanceCycle> {
    const cycle = await this.prisma.performanceCycle.findUnique({
      where: { id },
      include: {
        department: true,
        _count: { select: { reviews: true, goals: true } },
      },
    });
    if (!cycle) {
      throw new NotFoundException(`Performance cycle ${id} not found`);
    }
    return cycle;
  }

  async listCycles(query: QueryCyclesDto): Promise<PerformanceCycle[]> {
    return this.prisma.performanceCycle.findMany({
      where: {
        ...(query.status ? { status: query.status } : {}),
        ...(query.reviewType ? { reviewType: query.reviewType } : {}),
      },
      include: {
        department: true,
        _count: { select: { reviews: true, goals: true } },
      },
      orderBy: { startDate: 'desc' },
    });
  }

  // ===========================================================================
  // 2. EMPLOYEE GOALS & OBJECTIVES
  // ===========================================================================

  async createGoal(dto: CreateEmployeeGoalDto, actorUserId: string) {
    const employee = await this.prisma.employee.findUnique({
      where: { id: dto.employeeId },
      include: { department: true },
    });
    if (!employee) {
      throw new NotFoundException(`Employee ${dto.employeeId} not found`);
    }

    return this.prisma.$transaction(async (tx) => {
      const goalCode = await this.idGenerator.nextIdInTx(tx, 'GOL');

      const goal = await tx.employeeGoal.create({
        data: {
          goalCode,
          employeeId: dto.employeeId,
          cycleId: dto.cycleId ?? null,
          reviewerId: dto.reviewerId ?? employee.reportingManagerId ?? null,
          title: dto.title.trim(),
          description: dto.description?.trim() || null,
          category: dto.category ?? undefined,
          measurementMethod: dto.measurementMethod ?? undefined,
          target: dto.target.trim(),
          measurementPeriod: dto.measurementPeriod.trim(),
          weight: dto.weight ?? 0,
          evidence: dto.evidence?.trim() || null,
          createdById: actorUserId,
          status: GoalStatus.NOT_STARTED,
        },
        include: {
          employee: { select: { id: true, firstName: true, lastName: true, businessId: true } },
          reviewer: { select: { id: true, firstName: true, lastName: true, businessId: true } },
        },
      });

      await this.auditService.recordInTx(tx, {
        entityType: 'EmployeeGoal',
        entityId: goal.id,
        action: 'EMPLOYEE_GOAL_CREATED',
        actorUserId,
        newValue: { goalCode, title: goal.title, employeeId: dto.employeeId },
        reason: 'Employee goal created',
      });

      return goal;
    });
  }

  async updateGoal(id: string, dto: UpdateEmployeeGoalDto, actorUserId: string) {
    return this.prisma.$transaction(async (tx) => {
      const goal = await tx.employeeGoal.findUnique({
        where: { id },
        include: { employee: true },
      });
      if (!goal) {
        throw new NotFoundException(`Goal ${id} not found`);
      }

      const updated = await tx.employeeGoal.update({
        where: { id },
        data: {
          ...(dto.title ? { title: dto.title.trim() } : {}),
          ...(dto.description !== undefined ? { description: dto.description?.trim() || null } : {}),
          ...(dto.category ? { category: dto.category } : {}),
          ...(dto.measurementMethod ? { measurementMethod: dto.measurementMethod } : {}),
          ...(dto.target ? { target: dto.target.trim() } : {}),
          ...(dto.actualResult !== undefined ? { actualResult: dto.actualResult?.trim() || null } : {}),
          ...(dto.weight !== undefined ? { weight: dto.weight } : {}),
          ...(dto.evidence !== undefined ? { evidence: dto.evidence?.trim() || null } : {}),
          ...(dto.status ? { status: dto.status } : {}),
        },
        include: {
          employee: { select: { id: true, firstName: true, lastName: true, businessId: true } },
          reviewer: { select: { id: true, firstName: true, lastName: true, businessId: true } },
        },
      });

      await this.auditService.recordInTx(tx, {
        entityType: 'EmployeeGoal',
        entityId: id,
        action: 'EMPLOYEE_GOAL_UPDATED',
        actorUserId,
        oldValue: { status: goal.status, actualResult: goal.actualResult },
        newValue: { status: updated.status, actualResult: updated.actualResult },
        reason: 'Employee goal updated',
      });

      return updated;
    });
  }

  async getGoalById(
    id: string,
    actorUserId: string,
    hasOrgWide = false,
    hasTeam = false,
  ) {
    const goal = await this.prisma.employeeGoal.findUnique({
      where: { id },
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            businessId: true,
            jobTitle: true,
            userId: true,
            departmentId: true,
            reportingManagerId: true,
          },
        },
        reviewer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            businessId: true,
            userId: true,
          },
        },
        cycle: true,
      },
    });
    if (!goal) {
      throw new NotFoundException(`Goal ${id} not found`);
    }

    const isOwner = goal.employee.userId === actorUserId;
    const isReviewer = goal.reviewer?.userId === actorUserId;

    if (hasOrgWide) {
      return goal;
    }

    if (hasTeam) {
      const actorEmployee = await this.prisma.employee.findFirst({
        where: { userId: actorUserId },
        select: { id: true, departmentId: true },
      });
      const isSameDepartment = Boolean(
        actorEmployee?.departmentId &&
          actorEmployee.departmentId === goal.employee.departmentId,
      );
      const isDirectReport = Boolean(
        actorEmployee?.id &&
          (goal.reviewerId === actorEmployee.id ||
            goal.employee.reportingManagerId === actorEmployee.id),
      );
      if (isOwner || isReviewer || isSameDepartment || isDirectReport) {
        return goal;
      }
      throw new ForbiddenException({
        code: 'GOAL_ACCESS_FORBIDDEN',
        message: 'You are not authorized to view this goal',
      });
    }

    if (isOwner || isReviewer) {
      return goal;
    }

    throw new ForbiddenException({
      code: 'GOAL_ACCESS_FORBIDDEN',
      message: 'You are not authorized to view this goal',
    });
  }

  async listGoals(query: QueryGoalsDto, actorUserId: string, hasTeamOrAllRead = true) {
    // If not management or HR, restrict strictly to own employee ID
    let effectiveEmployeeId = query.employeeId;
    if (!hasTeamOrAllRead) {
      const actorEmployee = await this.prisma.employee.findFirst({
        where: { userId: actorUserId },
        select: { id: true },
      });
      if (!actorEmployee) return [];
      effectiveEmployeeId = actorEmployee.id;
    }

    return this.prisma.employeeGoal.findMany({
      where: {
        ...(effectiveEmployeeId ? { employeeId: effectiveEmployeeId } : {}),
        ...(query.cycleId ? { cycleId: query.cycleId } : {}),
        ...(query.measurementPeriod ? { measurementPeriod: query.measurementPeriod } : {}),
        ...(query.status ? { status: query.status } : {}),
      },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true, businessId: true, jobTitle: true } },
        reviewer: { select: { id: true, firstName: true, lastName: true, businessId: true } },
        cycle: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ===========================================================================
  // 3. PERFORMANCE REVIEWS
  // ===========================================================================

  async createReview(dto: CreatePerformanceReviewDto, actorUserId: string) {
    const employee = await this.prisma.employee.findUnique({
      where: { id: dto.employeeId },
      include: { department: true },
    });
    if (!employee) {
      throw new NotFoundException(`Employee ${dto.employeeId} not found`);
    }

    // Separation of duties check: cannot review oneself
    if (employee.userId && employee.userId === actorUserId) {
      throw new ForbiddenException({
        code: 'SELF_PERFORMANCE_REVIEW_FORBIDDEN',
        message: 'Employees cannot conduct their own performance reviews',
      });
    }

    const actorEmployee = await this.prisma.employee.findFirst({
      where: { userId: actorUserId },
      select: { id: true },
    });
    if (actorEmployee && actorEmployee.id === dto.employeeId) {
      throw new ForbiddenException({
        code: 'SELF_PERFORMANCE_REVIEW_FORBIDDEN',
        message: 'Employees cannot conduct their own performance reviews',
      });
    }

    // Determine reviewer ID
    let reviewerId = dto.reviewerId || employee.reportingManagerId || actorEmployee?.id;
    if (!reviewerId) {
      throw new BadRequestException('A valid reviewerId (reporting manager or designated evaluator) is required');
    }
    if (reviewerId === dto.employeeId) {
      throw new ForbiddenException({
        code: 'SELF_PERFORMANCE_REVIEW_FORBIDDEN',
        message: 'An employee cannot be designated as their own reviewer',
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const reviewCode = await this.idGenerator.nextIdInTx(tx, 'REV');

      const review = await tx.performanceReview.create({
        data: {
          reviewCode,
          employeeId: dto.employeeId,
          reviewerId,
          cycleId: dto.cycleId ?? null,
          period: dto.period.trim(),
          reviewType: dto.reviewType ?? PerformanceReviewType.MONTHLY,
          status: PerformanceReviewStatus.DRAFT,
          createdById: actorUserId,
        },
        include: {
          employee: { select: { id: true, firstName: true, lastName: true, businessId: true, userId: true, jobTitle: true } },
          reviewer: { select: { id: true, firstName: true, lastName: true, businessId: true } },
          cycle: true,
        },
      });

      await this.auditService.recordInTx(tx, {
        entityType: 'PerformanceReview',
        entityId: review.id,
        action: 'PERFORMANCE_REVIEW_CREATED',
        actorUserId,
        newValue: { reviewCode, employeeId: dto.employeeId, period: dto.period },
        reason: 'Performance review initiated',
      });

      return review;
    });
  }

  async getReviewById(
    id: string,
    actorUserId: string,
    hasOrgWide = false,
    hasTeam = false,
  ) {
    const review = await this.prisma.performanceReview.findUnique({
      where: { id },
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            businessId: true,
            userId: true,
            jobTitle: true,
            departmentId: true,
            department: true,
            reportingManagerId: true,
          },
        },
        reviewer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            businessId: true,
            userId: true,
          },
        },
        cycle: true,
        amendments: {
          include: { changedBy: { select: { id: true, email: true } } },
          orderBy: { createdAt: 'desc' },
        },
        pips: true,
      },
    });

    if (!review) {
      throw new NotFoundException(`Performance review ${id} not found`);
    }

    const isReviewedEmployee = review.employee?.userId === actorUserId;
    const isReviewer = review.reviewer?.userId === actorUserId;

    if (hasOrgWide) {
      return this.sanitizeReview(review, actorUserId, true);
    }

    if (hasTeam) {
      const actorEmployee = await this.prisma.employee.findFirst({
        where: { userId: actorUserId },
        select: { id: true, departmentId: true },
      });
      const isSameDepartment = Boolean(
        actorEmployee?.departmentId &&
          actorEmployee.departmentId === review.employee.departmentId,
      );
      const isDirectReport = Boolean(
        actorEmployee?.id &&
          (review.reviewerId === actorEmployee.id ||
            review.employee.reportingManagerId === actorEmployee.id),
      );
      if (isReviewedEmployee || isReviewer || isSameDepartment || isDirectReport) {
        return this.sanitizeReview(review, actorUserId, false);
      }
      throw new ForbiddenException({
        code: 'REVIEW_ACCESS_FORBIDDEN',
        message: 'You are not authorized to view this confidential performance review',
      });
    }

    if (isReviewedEmployee || isReviewer) {
      return this.sanitizeReview(review, actorUserId, false);
    }

    throw new ForbiddenException({
      code: 'REVIEW_ACCESS_FORBIDDEN',
      message: 'You are not authorized to view this confidential performance review',
    });
  }

  async listReviews(
    query: QueryPerformanceReviewsDto,
    actorUserId: string,
    hasOrgWideRead = false,
    hasTeamRead = false,
  ) {
    let whereClause: any = {
      ...(query.cycleId ? { cycleId: query.cycleId } : {}),
      ...(query.period ? { period: query.period } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.reviewType ? { reviewType: query.reviewType } : {}),
    };

    if (hasOrgWideRead) {
      if (query.employeeId) whereClause.employeeId = query.employeeId;
      if (query.reviewerId) whereClause.reviewerId = query.reviewerId;
      if (query.departmentId) whereClause.employee = { departmentId: query.departmentId };
    } else if (hasTeamRead) {
      // Find actor's employee profile
      const actorEmployee = await this.prisma.employee.findFirst({
        where: { userId: actorUserId },
        select: { id: true, departmentId: true },
      });
      if (!actorEmployee) return { data: [], total: 0, page: 1, limit: 20 };

      // Scope to department or direct reports
      whereClause.OR = [
        { employee: { departmentId: actorEmployee.departmentId } },
        { reviewerId: actorEmployee.id },
        { employeeId: actorEmployee.id },
      ];
      if (query.employeeId) whereClause.employeeId = query.employeeId;
    } else {
      // Regular employee: strictly restricted to own reviews
      const actorEmployee = await this.prisma.employee.findFirst({
        where: { userId: actorUserId },
        select: { id: true },
      });
      if (!actorEmployee) return { data: [], total: 0, page: 1, limit: 20 };
      whereClause.employeeId = actorEmployee.id;
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const [total, reviews] = await Promise.all([
      this.prisma.performanceReview.count({ where: whereClause }),
      this.prisma.performanceReview.findMany({
        where: whereClause,
        include: {
          employee: { select: { id: true, firstName: true, lastName: true, businessId: true, userId: true, jobTitle: true, department: true } },
          reviewer: { select: { id: true, firstName: true, lastName: true, businessId: true, userId: true } },
          cycle: { select: { id: true, name: true, dueDate: true } },
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const sanitizedData = reviews.map((r) =>
      this.sanitizeReview(r, actorUserId, hasOrgWideRead),
    );

    return { data: sanitizedData, total, page, limit };
  }

  async updateSelfReview(id: string, dto: UpdateSelfReviewDto, actorUserId: string) {
    const review = await this.prisma.performanceReview.findUnique({
      where: { id },
      include: { employee: true },
    });
    if (!review) {
      throw new NotFoundException(`Performance review ${id} not found`);
    }

    // Only the reviewed employee can submit self-review comments
    const isReviewedEmployee = review.employee.userId === actorUserId;
    if (!isReviewedEmployee) {
      throw new ForbiddenException({
        code: 'SELF_REVIEW_FORBIDDEN',
        message: 'Only the reviewed employee can submit self-review comments',
      });
    }

    if (
      review.status === PerformanceReviewStatus.COMPLETED ||
      review.status === PerformanceReviewStatus.ACKNOWLEDGED
    ) {
      throw new ConflictException({
        code: 'REVIEW_ALREADY_COMPLETED',
        message: 'Cannot update self-review comments on a completed or acknowledged review',
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.performanceReview.update({
        where: { id },
        data: {
          employeeComments: dto.employeeComments.trim(),
          status: PerformanceReviewStatus.MANAGER_REVIEW,
        },
        include: {
          employee: { select: { id: true, firstName: true, lastName: true, businessId: true } },
          reviewer: { select: { id: true, firstName: true, lastName: true, businessId: true } },
        },
      });

      await this.auditService.recordInTx(tx, {
        entityType: 'PerformanceReview',
        entityId: id,
        action: 'PERFORMANCE_REVIEW_SELF_REVIEW_SUBMITTED',
        actorUserId,
        newValue: { status: updated.status },
        reason: 'Employee submitted self-review feedback',
      });

      return updated;
    });
  }

  async evaluateReview(id: string, dto: EvaluatePerformanceReviewDto, actorUserId: string) {
    const review = await this.prisma.performanceReview.findUnique({
      where: { id },
      include: { employee: true },
    });
    if (!review) {
      throw new NotFoundException(`Performance review ${id} not found`);
    }

    // Separation of duties: Cannot evaluate own review
    if (review.employee.userId === actorUserId) {
      throw new ForbiddenException({
        code: 'SELF_PERFORMANCE_REVIEW_FORBIDDEN',
        message: 'Employees cannot evaluate their own performance reviews',
      });
    }
    const actorEmployee = await this.prisma.employee.findFirst({
      where: { userId: actorUserId },
      select: { id: true },
    });
    if (actorEmployee && actorEmployee.id === review.employeeId) {
      throw new ForbiddenException({
        code: 'SELF_PERFORMANCE_REVIEW_FORBIDDEN',
        message: 'Employees cannot evaluate their own performance reviews',
      });
    }

    if (
      review.status === PerformanceReviewStatus.COMPLETED ||
      review.status === PerformanceReviewStatus.ACKNOWLEDGED
    ) {
      throw new ConflictException({
        code: 'REVIEW_ALREADY_FINALIZED',
        message: 'Completed reviews must be modified through formal amendments',
      });
    }

    if (dto.rating !== undefined && (dto.rating < 1 || dto.rating > 5)) {
      throw new BadRequestException('Rating must be an integer between 1 and 5');
    }

    return this.prisma.$transaction(async (tx) => {
      const nextStatus =
        dto.status ??
        (review.status === PerformanceReviewStatus.DRAFT ||
        review.status === PerformanceReviewStatus.SELF_REVIEW
          ? PerformanceReviewStatus.MANAGER_REVIEW
          : undefined);

      const updated = await tx.performanceReview.update({
        where: { id },
        data: {
          ...(dto.rating !== undefined ? { rating: dto.rating } : {}),
          ...(dto.strengths !== undefined ? { strengths: dto.strengths?.trim() || null } : {}),
          ...(dto.areasForImprovement !== undefined ? { areasForImprovement: dto.areasForImprovement?.trim() || null } : {}),
          ...(dto.qualityAssessment !== undefined ? { qualityAssessment: dto.qualityAssessment?.trim() || null } : {}),
          ...(dto.competencyAssessment !== undefined ? { competencyAssessment: dto.competencyAssessment?.trim() || null } : {}),
          ...(dto.managerFeedback !== undefined ? { managerFeedback: dto.managerFeedback?.trim() || null } : {}),
          ...(dto.confidentialNotes !== undefined ? { confidentialNotes: dto.confidentialNotes?.trim() || null } : {}),
          ...(dto.recommendedTraining !== undefined ? { recommendedTraining: dto.recommendedTraining?.trim() || null } : {}),
          ...(dto.pipRecommended !== undefined ? { pipRecommended: dto.pipRecommended } : {}),
          ...(nextStatus ? { status: nextStatus } : {}),
        },
        include: {
          employee: { select: { id: true, firstName: true, lastName: true, businessId: true } },
          reviewer: { select: { id: true, firstName: true, lastName: true, businessId: true } },
        },
      });

      await this.auditService.recordInTx(tx, {
        entityType: 'PerformanceReview',
        entityId: id,
        action: 'PERFORMANCE_REVIEW_EVALUATED',
        actorUserId,
        oldValue: { status: review.status, rating: review.rating },
        newValue: { status: updated.status, rating: updated.rating },
        reason: 'Manager updated performance review evaluation',
      });

      return updated;
    });
  }

  async finalizeReview(id: string, dto: FinalizePerformanceReviewDto, actorUserId: string) {
    if (dto.rating < 1 || dto.rating > 5) {
      throw new BadRequestException('Rating must be an integer between 1 and 5');
    }

    return this.prisma.$transaction(async (tx) => {
      // 1. Transactional advisory lock to prevent concurrent finalization races
      await this.acquireSortedLocks(tx, `performance-review-${id}`);

      const review = await tx.performanceReview.findUnique({
        where: { id },
        include: { employee: true },
      });
      if (!review) {
        throw new NotFoundException(`Performance review ${id} not found`);
      }

      // Separation of duties
      if (review.employee.userId === actorUserId) {
        throw new ForbiddenException({
          code: 'SELF_PERFORMANCE_REVIEW_FORBIDDEN',
          message: 'Employees cannot finalize their own performance reviews',
        });
      }
      const actorEmployee = await tx.employee.findFirst({
        where: { userId: actorUserId },
        select: { id: true },
      });
      if (actorEmployee && actorEmployee.id === review.employeeId) {
        throw new ForbiddenException({
          code: 'SELF_PERFORMANCE_REVIEW_FORBIDDEN',
          message: 'Employees cannot finalize their own performance reviews',
        });
      }

      // Valid state transition: require preceding status to be MANAGER_REVIEW or IN_DISCUSSION
      const validPrecedingStatuses: PerformanceReviewStatus[] = [
        PerformanceReviewStatus.MANAGER_REVIEW,
        PerformanceReviewStatus.IN_DISCUSSION,
      ];
      if (!validPrecedingStatuses.includes(review.status)) {
        if (
          review.status === PerformanceReviewStatus.COMPLETED ||
          review.status === PerformanceReviewStatus.ACKNOWLEDGED
        ) {
          throw new ConflictException({
            code: 'REVIEW_ALREADY_FINALIZED',
            message: 'This review has already been finalized',
          });
        }
        throw new BadRequestException({
          code: 'INVALID_REVIEW_STATUS_FOR_FINALIZATION',
          message: `Cannot finalize review in status '${review.status}'. Review must be in 'MANAGER_REVIEW' or 'IN_DISCUSSION' prior to finalization.`,
        });
      }

      const updated = await tx.performanceReview.update({
        where: { id },
        data: {
          rating: dto.rating,
          managerFeedback: dto.managerFeedback.trim(),
          strengths: dto.strengths.trim(),
          areasForImprovement: dto.areasForImprovement.trim(),
          qualityAssessment: dto.qualityAssessment?.trim() || null,
          competencyAssessment: dto.competencyAssessment?.trim() || null,
          confidentialNotes: dto.confidentialNotes?.trim() || null,
          recommendedTraining: dto.recommendedTraining?.trim() || null,
          pipRecommended: dto.pipRecommended ?? false,
          status: PerformanceReviewStatus.COMPLETED,
          finalizedAt: new Date(),
          finalizedById: actorUserId,
        },
        include: {
          employee: { select: { id: true, firstName: true, lastName: true, businessId: true } },
          reviewer: { select: { id: true, firstName: true, lastName: true, businessId: true } },
        },
      });

      // Audit trail
      await this.auditService.recordInTx(tx, {
        entityType: 'PerformanceReview',
        entityId: id,
        action: 'PERFORMANCE_REVIEW_FINALIZED',
        actorUserId,
        oldValue: { status: review.status },
        newValue: { status: updated.status, rating: updated.rating },
        reason: 'Performance review completed and finalized',
      });

      return updated;
    });
  }

  async acknowledgeReview(id: string, dto: AcknowledgePerformanceReviewDto, actorUserId: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.acquireSortedLocks(tx, `performance-review-${id}`);

      const review = await tx.performanceReview.findUnique({
        where: { id },
        include: { employee: true },
      });
      if (!review) {
        throw new NotFoundException(`Performance review ${id} not found`);
      }

      // Only the reviewed employee can acknowledge receipt
      const isReviewedEmployee = review.employee.userId === actorUserId;
      if (!isReviewedEmployee) {
        throw new ForbiddenException({
          code: 'REVIEW_ACKNOWLEDGEMENT_FORBIDDEN',
          message: 'Only the reviewed employee can acknowledge this performance review',
        });
      }

      if (review.status !== PerformanceReviewStatus.COMPLETED) {
        throw new ConflictException({
          code: 'REVIEW_NOT_COMPLETED',
          message: `Cannot acknowledge review in status ${review.status}; review must be COMPLETED`,
        });
      }

      if (review.acknowledgementStatus === ReviewAcknowledgementStatus.ACKNOWLEDGED) {
        throw new ConflictException({
          code: 'REVIEW_ALREADY_ACKNOWLEDGED',
          message: 'Review has already been acknowledged',
        });
      }

      const updated = await tx.performanceReview.update({
        where: { id },
        data: {
          status: PerformanceReviewStatus.ACKNOWLEDGED,
          acknowledgementStatus: dto.status,
          acknowledgedAt: new Date(),
          employeeCommentsOnAcknowledgement: dto.comments?.trim() || null,
        },
        include: {
          employee: { select: { id: true, firstName: true, lastName: true, businessId: true } },
          reviewer: { select: { id: true, firstName: true, lastName: true, businessId: true } },
        },
      });

      await this.auditService.recordInTx(tx, {
        entityType: 'PerformanceReview',
        entityId: id,
        action: 'PERFORMANCE_REVIEW_ACKNOWLEDGED',
        actorUserId,
        newValue: {
          acknowledgementStatus: dto.status,
          status: updated.status,
        },
        reason: 'Employee acknowledged performance review',
      });

      return updated;
    });
  }

  async amendReview(id: string, dto: AmendPerformanceReviewDto, actorUserId: string) {
    if (!dto.reason || dto.reason.trim().length < 5) {
      throw new BadRequestException('A documented reason of at least 5 characters is required for amendments');
    }
    if (dto.newRating !== undefined && (dto.newRating < 1 || dto.newRating > 5)) {
      throw new BadRequestException('newRating must be an integer between 1 and 5');
    }

    return this.prisma.$transaction(async (tx) => {
      await this.acquireSortedLocks(tx, `performance-review-${id}`);

      const review = await tx.performanceReview.findUnique({
        where: { id },
        include: { employee: true },
      });
      if (!review) {
        throw new NotFoundException(`Performance review ${id} not found`);
      }

      if (
        review.status !== PerformanceReviewStatus.COMPLETED &&
        review.status !== PerformanceReviewStatus.ACKNOWLEDGED
      ) {
        throw new ConflictException({
          code: 'REVIEW_NOT_FINALIZED',
          message: 'Only completed or acknowledged reviews can be amended',
        });
      }

      const diff: Record<string, { old: any; new: any }> = {};
      if (dto.newRating !== undefined && dto.newRating !== review.rating) {
        diff.rating = { old: review.rating, new: dto.newRating };
      }
      if (dto.managerFeedback && dto.managerFeedback.trim() !== review.managerFeedback) {
        diff.managerFeedback = { old: review.managerFeedback, new: dto.managerFeedback.trim() };
      }
      if (dto.strengths && dto.strengths.trim() !== review.strengths) {
        diff.strengths = { old: review.strengths, new: dto.strengths.trim() };
      }
      if (dto.areasForImprovement && dto.areasForImprovement.trim() !== review.areasForImprovement) {
        diff.areasForImprovement = { old: review.areasForImprovement, new: dto.areasForImprovement.trim() };
      }

      // Record immutable amendment
      await tx.performanceReviewAmendment.create({
        data: {
          reviewId: id,
          previousRating: review.rating,
          newRating: dto.newRating ?? review.rating,
          reason: dto.reason.trim(),
          changes: diff,
          changedById: actorUserId,
        },
      });

      const updated = await tx.performanceReview.update({
        where: { id },
        data: {
          ...(dto.newRating !== undefined ? { rating: dto.newRating } : {}),
          ...(dto.managerFeedback ? { managerFeedback: dto.managerFeedback.trim() } : {}),
          ...(dto.strengths ? { strengths: dto.strengths.trim() } : {}),
          ...(dto.areasForImprovement ? { areasForImprovement: dto.areasForImprovement.trim() } : {}),
          ...(dto.confidentialNotes !== undefined ? { confidentialNotes: dto.confidentialNotes?.trim() || null } : {}),
        },
      });

      await this.auditService.recordInTx(tx, {
        entityType: 'PerformanceReview',
        entityId: id,
        action: 'PERFORMANCE_REVIEW_AMENDED',
        actorUserId,
        oldValue: { rating: review.rating },
        newValue: { rating: updated.rating, reason: dto.reason.trim() },
        reason: `Performance review amended: ${dto.reason.trim()}`,
      });

      return updated;
    });
  }

  // ===========================================================================
  // 4. PERFORMANCE IMPROVEMENT PLANS (PIPs)
  // ===========================================================================

  async createPip(dto: CreatePipDto, actorUserId: string): Promise<PerformanceImprovementPlan> {
    if (!isValidCalendarDate(dto.startDate)) {
      throw new BadRequestException('startDate must be a valid calendar date in YYYY-MM-DD format');
    }
    if (!isValidCalendarDate(dto.targetCompletionDate)) {
      throw new BadRequestException('targetCompletionDate must be a valid calendar date in YYYY-MM-DD format');
    }
    if (dto.reviewDate && !isValidCalendarDate(dto.reviewDate)) {
      throw new BadRequestException('reviewDate must be a valid calendar date in YYYY-MM-DD format');
    }
    if (dto.startDate >= dto.targetCompletionDate) {
      throw new BadRequestException('startDate must be before targetCompletionDate');
    }

    const employee = await this.prisma.employee.findUnique({
      where: { id: dto.employeeId },
    });
    if (!employee) {
      throw new NotFoundException(`Employee ${dto.employeeId} not found`);
    }

    // Separation of duties: cannot put oneself on a PIP
    if (employee.userId === actorUserId) {
      throw new ForbiddenException({
        code: 'SELF_PIP_FORBIDDEN',
        message: 'Managers cannot create Performance Improvement Plans on themselves',
      });
    }

    const actorEmployee = await this.prisma.employee.findFirst({
      where: { userId: actorUserId },
      select: { id: true },
    });
    const managerId = dto.managerId || employee.reportingManagerId || actorEmployee?.id;
    if (!managerId) {
      throw new BadRequestException('A valid managerId is required to oversee the PIP');
    }
    if (managerId === dto.employeeId) {
      throw new ForbiddenException({
        code: 'SELF_PIP_FORBIDDEN',
        message: 'An employee cannot be designated as their own PIP manager',
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const pipCode = await this.idGenerator.nextIdInTx(tx, 'PIP');

      const pip = await tx.performanceImprovementPlan.create({
        data: {
          pipCode,
          employeeId: dto.employeeId,
          managerId,
          reviewId: dto.reviewId ?? null,
          reason: dto.reason.trim(),
          performanceGap: dto.performanceGap.trim(),
          expectedStandard: dto.expectedStandard.trim(),
          supportProvided: dto.supportProvided.trim(),
          startDate: dto.startDate,
          targetCompletionDate: dto.targetCompletionDate,
          reviewDate: dto.reviewDate ?? null,
          status: PipStatus.ACTIVE,
          createdById: actorUserId,
          objectives: {
            create: dto.objectives.map((o) => ({
              title: o.title.trim(),
              successCriteria: o.successCriteria.trim(),
              targetDate: o.targetDate,
              status: PipObjectiveStatus.PENDING,
            })),
          },
        },
        include: {
          objectives: true,
          employee: { select: { id: true, firstName: true, lastName: true, businessId: true } },
          manager: { select: { id: true, firstName: true, lastName: true, businessId: true } },
        },
      });

      await this.auditService.recordInTx(tx, {
        entityType: 'PerformanceImprovementPlan',
        entityId: pip.id,
        action: 'PIP_CREATED',
        actorUserId,
        newValue: { pipCode, employeeId: dto.employeeId, status: pip.status },
        reason: 'Performance Improvement Plan created',
      });

      return pip;
    });
  }

  async updatePip(id: string, dto: UpdatePipDto, actorUserId: string) {
    if (dto.targetCompletionDate && !isValidCalendarDate(dto.targetCompletionDate)) {
      throw new BadRequestException('targetCompletionDate must be a valid calendar date in YYYY-MM-DD format');
    }
    if (dto.reviewDate && !isValidCalendarDate(dto.reviewDate)) {
      throw new BadRequestException('reviewDate must be a valid calendar date in YYYY-MM-DD format');
    }

    return this.prisma.$transaction(async (tx) => {
      const pip = await tx.performanceImprovementPlan.findUnique({ where: { id } });
      if (!pip) {
        throw new NotFoundException(`PIP ${id} not found`);
      }

      const updated = await tx.performanceImprovementPlan.update({
        where: { id },
        data: {
          ...(dto.progressUpdates !== undefined ? { progressUpdates: dto.progressUpdates?.trim() || null } : {}),
          ...(dto.finalAssessment !== undefined ? { finalAssessment: dto.finalAssessment?.trim() || null } : {}),
          ...(dto.employeeComments !== undefined ? { employeeComments: dto.employeeComments?.trim() || null } : {}),
          ...(dto.targetCompletionDate ? { targetCompletionDate: dto.targetCompletionDate } : {}),
          ...(dto.reviewDate !== undefined ? { reviewDate: dto.reviewDate ?? null } : {}),
        },
        include: {
          objectives: true,
          employee: { select: { id: true, firstName: true, lastName: true, businessId: true } },
          manager: { select: { id: true, firstName: true, lastName: true, businessId: true } },
        },
      });

      await this.auditService.recordInTx(tx, {
        entityType: 'PerformanceImprovementPlan',
        entityId: id,
        action: 'PIP_UPDATED',
        actorUserId,
        newValue: { progressUpdates: updated.progressUpdates },
        reason: 'PIP progress updated',
      });

      return updated;
    });
  }

  async transitionPipStatus(id: string, dto: TransitionPipStatusDto, actorUserId: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.acquireSortedLocks(tx, `performance-pip-${id}`);

      const pip = await tx.performanceImprovementPlan.findUnique({
        where: { id },
        include: { employee: true },
      });
      if (!pip) {
        throw new NotFoundException(`PIP ${id} not found`);
      }

      // Separation of duties: employee cannot transition own PIP
      if (pip.employee.userId === actorUserId) {
        throw new ForbiddenException({
          code: 'SELF_PIP_FORBIDDEN',
          message: 'Employees cannot transition their own PIP status',
        });
      }

      // Validations for closing
      if (
        (dto.status === PipStatus.CLOSED ||
          dto.status === PipStatus.IMPROVEMENT_ACHIEVED ||
          dto.status === PipStatus.NOT_ACHIEVED) &&
        !dto.closureReason &&
        !dto.finalAssessment
      ) {
        throw new BadRequestException('A documented closureReason or finalAssessment is required when closing a PIP');
      }

      const updated = await tx.performanceImprovementPlan.update({
        where: { id },
        data: {
          status: dto.status,
          ...(dto.closureReason ? { closureReason: dto.closureReason.trim() } : {}),
          ...(dto.finalAssessment ? { finalAssessment: dto.finalAssessment.trim() } : {}),
        },
        include: {
          objectives: true,
          employee: { select: { id: true, firstName: true, lastName: true, businessId: true } },
          manager: { select: { id: true, firstName: true, lastName: true, businessId: true } },
        },
      });

      await this.auditService.recordInTx(tx, {
        entityType: 'PerformanceImprovementPlan',
        entityId: id,
        action: 'PIP_STATUS_TRANSITIONED',
        actorUserId,
        oldValue: { status: pip.status },
        newValue: { status: updated.status, closureReason: updated.closureReason },
        reason: `PIP status transitioned to ${dto.status}`,
      });

      return updated;
    });
  }

  async updatePipObjectiveStatus(
    pipId: string,
    objectiveId: string,
    status: PipObjectiveStatus,
    actorUserId: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const obj = await tx.pipObjective.findUnique({
        where: { id: objectiveId },
      });
      if (!obj || obj.pipId !== pipId) {
        throw new NotFoundException(`Objective ${objectiveId} for PIP ${pipId} not found`);
      }

      const updated = await tx.pipObjective.update({
        where: { id: objectiveId },
        data: { status },
      });

      await this.auditService.recordInTx(tx, {
        entityType: 'PipObjective',
        entityId: objectiveId,
        action: 'PIP_OBJECTIVE_STATUS_UPDATED',
        actorUserId,
        oldValue: { status: obj.status },
        newValue: { status: updated.status },
        reason: `Objective status updated to ${status}`,
      });

      return updated;
    });
  }

  async getPipById(
    id: string,
    actorUserId: string,
    hasOrgWide = false,
    hasTeam = false,
  ) {
    const pip = await this.prisma.performanceImprovementPlan.findUnique({
      where: { id },
      include: {
        objectives: true,
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            businessId: true,
            jobTitle: true,
            departmentId: true,
            department: true,
            userId: true,
            reportingManagerId: true,
          },
        },
        manager: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            businessId: true,
            userId: true,
          },
        },
        review: {
          select: {
            id: true,
            reviewCode: true,
            period: true,
            rating: true,
          },
        },
      },
    });
    if (!pip) {
      throw new NotFoundException(`PIP ${id} not found`);
    }

    const isSubject = pip.employee.userId === actorUserId;
    const isManager = pip.manager.userId === actorUserId;

    if (hasOrgWide) {
      return pip;
    }

    if (hasTeam) {
      const actorEmployee = await this.prisma.employee.findFirst({
        where: { userId: actorUserId },
        select: { id: true, departmentId: true },
      });
      const isSameDepartment = Boolean(
        actorEmployee?.departmentId &&
          actorEmployee.departmentId === pip.employee.departmentId,
      );
      const isDirectReport = Boolean(
        actorEmployee?.id &&
          (pip.managerId === actorEmployee.id ||
            pip.employee.reportingManagerId === actorEmployee.id),
      );
      if (isSubject || isManager || isSameDepartment || isDirectReport) {
        return pip;
      }
      throw new ForbiddenException({
        code: 'PIP_ACCESS_FORBIDDEN',
        message: 'You are not authorized to view this performance improvement plan',
      });
    }

    if (isSubject || isManager) {
      return pip;
    }

    throw new ForbiddenException({
      code: 'PIP_ACCESS_FORBIDDEN',
      message: 'You are not authorized to view this performance improvement plan',
    });
  }

  async listPips(query: QueryPipsDto, actorUserId: string, hasTeamOrAllRead = true) {
    let effectiveEmployeeId = query.employeeId;
    if (!hasTeamOrAllRead) {
      const actorEmployee = await this.prisma.employee.findFirst({
        where: { userId: actorUserId },
        select: { id: true },
      });
      if (!actorEmployee) return [];
      effectiveEmployeeId = actorEmployee.id;
    }

    return this.prisma.performanceImprovementPlan.findMany({
      where: {
        ...(effectiveEmployeeId ? { employeeId: effectiveEmployeeId } : {}),
        ...(query.managerId ? { managerId: query.managerId } : {}),
        ...(query.status ? { status: query.status } : {}),
      },
      include: {
        objectives: true,
        employee: { select: { id: true, firstName: true, lastName: true, businessId: true, jobTitle: true, department: true } },
        manager: { select: { id: true, firstName: true, lastName: true, businessId: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ===========================================================================
  // 5. DASHBOARD & METRICS
  // ===========================================================================

  async getDashboardMetrics(
    actorUserId: string,
    hasOrgWide = false,
    hasTeam = false,
  ) {
    const today = new Date().toISOString().slice(0, 10);

    const actorEmployee = await this.prisma.employee.findFirst({
      where: { userId: actorUserId },
      select: { id: true, departmentId: true },
    });

    let reviewWhere: any = {};
    let goalWhere: any = {};
    let pipWhere: any = {};
    let allowDeptList = false;

    if (hasOrgWide) {
      allowDeptList = true;
    } else if (hasTeam && actorEmployee) {
      reviewWhere = {
        OR: [
          { employee: { departmentId: actorEmployee.departmentId } },
          { reviewerId: actorEmployee.id },
          { employeeId: actorEmployee.id },
        ],
      };
      goalWhere = {
        OR: [
          { employee: { departmentId: actorEmployee.departmentId } },
          { reviewerId: actorEmployee.id },
          { employeeId: actorEmployee.id },
        ],
      };
      pipWhere = {
        OR: [
          { employee: { departmentId: actorEmployee.departmentId } },
          { managerId: actorEmployee.id },
          { employeeId: actorEmployee.id },
        ],
      };
    } else {
      // Regular employee / read-own only
      if (!actorEmployee) {
        return {
          reviewsTotal: 0,
          reviewsCompleted: 0,
          reviewsAcknowledged: 0,
          reviewsPendingAcknowledgement: 0,
          reviewsOverdue: 0,
          reviewsPending: 0,
          goalsOnTrack: 0,
          goalsAtRisk: 0,
          goalsAchieved: 0,
          activePips: 0,
          reviewsWithTraining: 0,
          departments: [],
        };
      }
      reviewWhere = { employeeId: actorEmployee.id };
      goalWhere = { employeeId: actorEmployee.id };
      pipWhere = { employeeId: actorEmployee.id };
    }

    const [
      reviewsTotal,
      reviewsCompleted,
      reviewsAcknowledged,
      reviewsPendingAcknowledgement,
      reviewsOverdue,
      goalsOnTrack,
      goalsAtRisk,
      goalsAchieved,
      activePips,
      reviewsWithTraining,
      departments,
    ] = await Promise.all([
      this.prisma.performanceReview.count({ where: reviewWhere }),
      this.prisma.performanceReview.count({
        where: {
          ...reviewWhere,
          status: { in: [PerformanceReviewStatus.COMPLETED, PerformanceReviewStatus.ACKNOWLEDGED] },
        },
      }),
      this.prisma.performanceReview.count({
        where: {
          ...reviewWhere,
          status: PerformanceReviewStatus.ACKNOWLEDGED,
        },
      }),
      this.prisma.performanceReview.count({
        where: {
          ...reviewWhere,
          status: PerformanceReviewStatus.COMPLETED,
          acknowledgementStatus: ReviewAcknowledgementStatus.PENDING,
        },
      }),
      this.prisma.performanceReview.count({
        where: {
          ...reviewWhere,
          status: { in: [PerformanceReviewStatus.DRAFT, PerformanceReviewStatus.SELF_REVIEW, PerformanceReviewStatus.MANAGER_REVIEW] },
          cycle: { dueDate: { lt: today } },
        },
      }),
      this.prisma.employeeGoal.count({
        where: {
          ...goalWhere,
          status: GoalStatus.ON_TRACK,
        },
      }),
      this.prisma.employeeGoal.count({
        where: {
          ...goalWhere,
          status: GoalStatus.AT_RISK,
        },
      }),
      this.prisma.employeeGoal.count({
        where: {
          ...goalWhere,
          status: GoalStatus.ACHIEVED,
        },
      }),
      this.prisma.performanceImprovementPlan.count({
        where: {
          ...pipWhere,
          status: { in: [PipStatus.ACTIVE, PipStatus.MONITORING, PipStatus.EXTENDED] },
        },
      }),
      this.prisma.performanceReview.count({
        where: {
          ...reviewWhere,
          recommendedTraining: { not: null },
        },
      }),
      allowDeptList
        ? this.prisma.department.findMany({
            where: { status: 'ACTIVE' },
            select: { id: true, name: true, code: true },
          })
        : actorEmployee?.departmentId
        ? this.prisma.department.findMany({
            where: { id: actorEmployee.departmentId, status: 'ACTIVE' },
            select: { id: true, name: true, code: true },
          })
        : Promise.resolve([]),
    ]);

    return {
      reviewsTotal,
      reviewsCompleted,
      reviewsAcknowledged,
      reviewsPendingAcknowledgement,
      reviewsOverdue,
      reviewsPending: reviewsTotal - reviewsCompleted,
      goalsOnTrack,
      goalsAtRisk,
      goalsAchieved,
      activePips,
      reviewsWithTraining,
      departments,
    };
  }
}
