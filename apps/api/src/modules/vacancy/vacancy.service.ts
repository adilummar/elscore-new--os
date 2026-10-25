import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Vacancy, VacancyStatus } from '@prisma/client';

import { AuditService } from '../../common/audit/audit.service';
import { IdGeneratorService } from '../../common/id-generator/id-generator.service';
import { PrismaService, PrismaTxClient } from '../../common/prisma/prisma.service';
import { AuthorizationService } from '../../common/rbac/authorization.service';

import { CreateVacancyDto, SUPPORTED_CURRENCIES } from './dto/create-vacancy.dto';
import { QueryVacanciesDto } from './dto/query-vacancies.dto';
import { ReviewVacancyDto } from './dto/review-vacancy.dto';
import { TransitionVacancyStatusDto } from './dto/transition-vacancy-status.dto';
import { UpdateVacancyDto } from './dto/update-vacancy.dto';

const ALLOWED_STATUS_TRANSITIONS: Record<VacancyStatus, VacancyStatus[]> = {
  [VacancyStatus.DRAFT]: [VacancyStatus.PENDING_APPROVAL, VacancyStatus.CANCELLED],
  [VacancyStatus.PENDING_APPROVAL]: [
    VacancyStatus.APPROVED,
    VacancyStatus.REJECTED,
    VacancyStatus.DRAFT,
    VacancyStatus.CANCELLED,
  ],
  [VacancyStatus.APPROVED]: [VacancyStatus.OPEN, VacancyStatus.ON_HOLD, VacancyStatus.CANCELLED],
  [VacancyStatus.OPEN]: [
    VacancyStatus.OPEN,
    VacancyStatus.ON_HOLD,
    VacancyStatus.FILLED,
    VacancyStatus.CANCELLED,
  ],
  [VacancyStatus.ON_HOLD]: [VacancyStatus.OPEN, VacancyStatus.CANCELLED],
  [VacancyStatus.FILLED]: [VacancyStatus.OPEN, VacancyStatus.CANCELLED],
  [VacancyStatus.REJECTED]: [VacancyStatus.DRAFT, VacancyStatus.CANCELLED],
  [VacancyStatus.CANCELLED]: [],
};

/**
 * Validates that a string is a real Gregorian calendar date in YYYY-MM-DD format.
 */
function validateCalendarDate(dateStr: string, fieldName: string): void {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!match) {
    throw new BadRequestException(`${fieldName} must match YYYY-MM-DD format`);
  }
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    throw new BadRequestException(`${fieldName} is not a valid calendar date`);
  }

  const d = new Date(Date.UTC(year, month - 1, day));
  if (
    d.getUTCFullYear() !== year ||
    d.getUTCMonth() !== month - 1 ||
    d.getUTCDate() !== day
  ) {
    throw new BadRequestException(`${fieldName} is not a valid calendar date`);
  }
}

@Injectable()
export class VacancyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly idGenerator: IdGeneratorService,
    private readonly authService: AuthorizationService,
  ) {}

  /**
   * Acquire a transaction-level PostgreSQL advisory lock on a vacancy record
   * to serialize concurrent lifecycle mutations.
   */
  private async acquireVacancyLock(tx: PrismaTxClient, vacancyId: string): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('vacancy-' || ${vacancyId}))`;
  }

  /**
   * Create a new draft workforce vacancy.
   */
  async createVacancy(dto: CreateVacancyDto, actorUserId: string): Promise<Vacancy> {
    if (dto.budgetMin !== undefined && dto.budgetMax !== undefined && dto.budgetMin > dto.budgetMax) {
      throw new BadRequestException('budgetMin cannot exceed budgetMax');
    }

    // Currency validation (DATA-VAC-005)
    if (dto.currency && !SUPPORTED_CURRENCIES.includes(dto.currency as any)) {
      throw new BadRequestException(
        `Unsupported currency: '${dto.currency}'. Supported currencies: ${SUPPORTED_CURRENCIES.join(', ')}`,
      );
    }

    // Date validation (DATA-VAC-004)
    if (dto.targetStartDate) {
      validateCalendarDate(dto.targetStartDate, 'targetStartDate');
    }
    if (dto.targetClosureDate) {
      validateCalendarDate(dto.targetClosureDate, 'targetClosureDate');
    }
    if (dto.targetStartDate && dto.targetClosureDate && dto.targetStartDate > dto.targetClosureDate) {
      throw new BadRequestException('targetStartDate cannot be after targetClosureDate');
    }

    // Headcount validation (SEC-VAC-003)
    if (dto.targetHeadcount !== undefined && dto.targetHeadcount < 1) {
      throw new BadRequestException('targetHeadcount must be at least 1');
    }

    // Verify department exists
    const department = await this.prisma.department.findUnique({
      where: { id: dto.departmentId },
    });
    if (!department) {
      throw new NotFoundException(`Department with ID '${dto.departmentId}' not found`);
    }

    // Verify role exists if provided
    if (dto.roleId) {
      const role = await this.prisma.role.findUnique({
        where: { id: dto.roleId },
      });
      if (!role) {
        throw new NotFoundException(`Role with ID '${dto.roleId}' not found`);
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const businessId = await this.idGenerator.nextIdInTx(tx, 'VAC');

      const vacancy = await tx.vacancy.create({
        data: {
          businessId,
          title: dto.title.trim(),
          departmentId: dto.departmentId,
          roleId: dto.roleId || null,
          employmentType: dto.employmentType,
          workMode: dto.workMode,
          location: dto.location?.trim() || null,
          targetHeadcount: dto.targetHeadcount ?? 1,
          filledHeadcount: 0,
          priority: dto.priority,
          status: VacancyStatus.DRAFT,
          justification: dto.justification.trim(),
          targetStartDate: dto.targetStartDate || null,
          targetClosureDate: dto.targetClosureDate || null,
          budgetMin: dto.budgetMin !== undefined ? new Prisma.Decimal(dto.budgetMin) : null,
          budgetMax: dto.budgetMax !== undefined ? new Prisma.Decimal(dto.budgetMax) : null,
          currency: dto.currency || 'INR',
          notes: dto.notes?.trim() || null,
          requestedByUserId: actorUserId,
        },
        include: {
          department: true,
          role: true,
          requestedBy: {
            select: {
              id: true,
              email: true,
              employee: {
                select: { firstName: true, lastName: true },
              },
            },
          },
        },
      });

      await this.auditService.recordInTx(tx, {
        entityType: 'Vacancy',
        entityId: vacancy.id,
        action: 'VACANCY_CREATED',
        actorUserId,
        newValue: {
          businessId: vacancy.businessId,
          title: vacancy.title,
          status: vacancy.status,
          targetHeadcount: vacancy.targetHeadcount,
        },
        reason: 'Workforce vacancy created in draft',
      });

      return vacancy;
    });
  }

  /**
   * Update a vacancy while in DRAFT or PENDING_APPROVAL.
   * SEC-VAC-001: Creators can edit their own draft/rejected vacancies. HR Manager can edit draft/pending vacancies.
   */
  async updateVacancy(id: string, dto: UpdateVacancyDto, actorUserId: string): Promise<Vacancy> {
    return this.prisma.$transaction(async (tx) => {
      await this.acquireVacancyLock(tx, id);

      const existing = await tx.vacancy.findUnique({
        where: { id },
      });
      if (!existing) {
        throw new NotFoundException(`Vacancy with ID '${id}' not found`);
      }

      // Authorization & Ownership check (SEC-VAC-001)
      const hasUpdate = await this.authService.hasPermission(actorUserId, 'vacancy.update');
      const hasCreate = await this.authService.hasPermission(actorUserId, 'vacancy.create');

      if (!hasUpdate && !hasCreate) {
        throw new ForbiddenException('Access denied. You do not have permission to modify vacancies.');
      }

      if (!hasUpdate) {
        // Creator with vacancy.create can only edit their own draft or rejected vacancies
        if (existing.requestedByUserId !== actorUserId) {
          throw new ForbiddenException('You can only edit your own vacancy requisitions.');
        }
        if (existing.status !== VacancyStatus.DRAFT && existing.status !== VacancyStatus.REJECTED) {
          throw new BadRequestException(
            `Creators can only edit vacancies in DRAFT or REJECTED status (current: ${existing.status})`,
          );
        }
      } else {
        // Manager with vacancy.update can edit in DRAFT or PENDING_APPROVAL
        if (
          existing.status !== VacancyStatus.DRAFT &&
          existing.status !== VacancyStatus.PENDING_APPROVAL
        ) {
          throw new BadRequestException(
            `Cannot edit vacancy details in '${existing.status}' status. Only DRAFT or PENDING_APPROVAL can be edited.`,
          );
        }
      }

      // Headcount bounds validation (SEC-VAC-003)
      if (dto.targetHeadcount !== undefined) {
        if (dto.targetHeadcount < 1) {
          throw new BadRequestException('targetHeadcount must be at least 1');
        }
        if (dto.targetHeadcount < existing.filledHeadcount) {
          throw new BadRequestException(
            `targetHeadcount (${dto.targetHeadcount}) cannot be less than already filled headcount (${existing.filledHeadcount})`,
          );
        }
      }

      // Currency validation (DATA-VAC-005)
      if (dto.currency && !SUPPORTED_CURRENCIES.includes(dto.currency as any)) {
        throw new BadRequestException(
          `Unsupported currency: '${dto.currency}'. Supported currencies: ${SUPPORTED_CURRENCIES.join(', ')}`,
        );
      }

      // Date validation (DATA-VAC-004)
      const finalStartDate = dto.targetStartDate !== undefined ? dto.targetStartDate : existing.targetStartDate;
      const finalClosureDate = dto.targetClosureDate !== undefined ? dto.targetClosureDate : existing.targetClosureDate;

      if (dto.targetStartDate) {
        validateCalendarDate(dto.targetStartDate, 'targetStartDate');
      }
      if (dto.targetClosureDate) {
        validateCalendarDate(dto.targetClosureDate, 'targetClosureDate');
      }
      if (finalStartDate && finalClosureDate && finalStartDate > finalClosureDate) {
        throw new BadRequestException('targetStartDate cannot be after targetClosureDate');
      }

      const budgetMin =
        dto.budgetMin !== undefined
          ? dto.budgetMin
          : existing.budgetMin
            ? Number(existing.budgetMin)
            : undefined;
      const budgetMax =
        dto.budgetMax !== undefined
          ? dto.budgetMax
          : existing.budgetMax
            ? Number(existing.budgetMax)
            : undefined;

      if (budgetMin !== undefined && budgetMax !== undefined && budgetMin > budgetMax) {
        throw new BadRequestException('budgetMin cannot exceed budgetMax');
      }

      if (dto.departmentId) {
        const department = await tx.department.findUnique({
          where: { id: dto.departmentId },
        });
        if (!department) {
          throw new NotFoundException(`Department with ID '${dto.departmentId}' not found`);
        }
      }

      if (dto.roleId) {
        const role = await tx.role.findUnique({
          where: { id: dto.roleId },
        });
        if (!role) {
          throw new NotFoundException(`Role with ID '${dto.roleId}' not found`);
        }
      }

      const updated = await tx.vacancy.update({
        where: { id },
        data: {
          title: dto.title !== undefined ? dto.title.trim() : undefined,
          departmentId: dto.departmentId,
          roleId: dto.roleId !== undefined ? dto.roleId || null : undefined,
          employmentType: dto.employmentType,
          workMode: dto.workMode,
          location: dto.location !== undefined ? dto.location?.trim() || null : undefined,
          targetHeadcount: dto.targetHeadcount,
          priority: dto.priority,
          justification: dto.justification !== undefined ? dto.justification.trim() : undefined,
          targetStartDate: dto.targetStartDate !== undefined ? dto.targetStartDate || null : undefined,
          targetClosureDate: dto.targetClosureDate !== undefined ? dto.targetClosureDate || null : undefined,
          budgetMin: dto.budgetMin !== undefined ? new Prisma.Decimal(dto.budgetMin) : undefined,
          budgetMax: dto.budgetMax !== undefined ? new Prisma.Decimal(dto.budgetMax) : undefined,
          currency: dto.currency,
          notes: dto.notes !== undefined ? dto.notes?.trim() || null : undefined,
        },
        include: {
          department: true,
          role: true,
          requestedBy: {
            select: {
              id: true,
              email: true,
              employee: {
                select: { firstName: true, lastName: true },
              },
            },
          },
          reviewedBy: {
            select: {
              id: true,
              email: true,
              employee: {
                select: { firstName: true, lastName: true },
              },
            },
          },
        },
      });

      await this.auditService.recordInTx(tx, {
        entityType: 'Vacancy',
        entityId: updated.id,
        action: 'VACANCY_UPDATED',
        actorUserId,
        oldValue: {
          title: existing.title,
          targetHeadcount: existing.targetHeadcount,
          priority: existing.priority,
        },
        newValue: {
          title: updated.title,
          targetHeadcount: updated.targetHeadcount,
          priority: updated.priority,
        },
        reason: 'Workforce vacancy fields updated',
      });

      return updated;
    });
  }

  /**
   * Submit draft vacancy for approval.
   * SEC-VAC-001: Authorized creator can submit their own draft; HR Manager can submit any draft.
   */
  async submitForApproval(id: string, actorUserId: string): Promise<Vacancy> {
    return this.prisma.$transaction(async (tx) => {
      await this.acquireVacancyLock(tx, id);

      const existing = await tx.vacancy.findUnique({
        where: { id },
      });
      if (!existing) {
        throw new NotFoundException(`Vacancy with ID '${id}' not found`);
      }

      // Authorization & Ownership check (SEC-VAC-001)
      const hasUpdate = await this.authService.hasPermission(actorUserId, 'vacancy.update');
      const hasCreate = await this.authService.hasPermission(actorUserId, 'vacancy.create');

      if (!hasUpdate && !hasCreate) {
        throw new ForbiddenException('Access denied. You do not have permission to submit vacancies.');
      }

      if (!hasUpdate) {
        // Creator with vacancy.create can only submit their own draft or rejected vacancies
        if (existing.requestedByUserId !== actorUserId) {
          throw new ForbiddenException('You can only submit your own vacancy requisitions.');
        }
      }

      if (existing.status !== VacancyStatus.DRAFT && existing.status !== VacancyStatus.REJECTED) {
        throw new BadRequestException(
          `Only vacancies in DRAFT or REJECTED status can be submitted for approval (current: ${existing.status})`,
        );
      }

      const updated = await tx.vacancy.update({
        where: { id },
        data: {
          status: VacancyStatus.PENDING_APPROVAL,
          reviewedByUserId: null,
          reviewedAt: null,
          reviewNote: null,
        },
        include: {
          department: true,
          role: true,
          requestedBy: {
            select: {
              id: true,
              email: true,
              employee: {
                select: { firstName: true, lastName: true },
              },
            },
          },
        },
      });

      await this.auditService.recordInTx(tx, {
        entityType: 'Vacancy',
        entityId: id,
        action: 'VACANCY_SUBMITTED',
        actorUserId,
        oldValue: { status: existing.status },
        newValue: { status: updated.status },
        reason: 'Submitted vacancy request for management approval',
      });

      return updated;
    });
  }

  /**
   * Review (Approve / Reject) a pending vacancy.
   * STRICT SEPARATION OF DUTIES: Requester CANNOT approve their own vacancy request.
   * SEC-VAC-002: Rejection requires a mandatory, non-empty review note.
   */
  async reviewVacancy(id: string, dto: ReviewVacancyDto, actorUserId: string): Promise<Vacancy> {
    return this.prisma.$transaction(async (tx) => {
      await this.acquireVacancyLock(tx, id);

      const existing = await tx.vacancy.findUnique({
        where: { id },
      });
      if (!existing) {
        throw new NotFoundException(`Vacancy with ID '${id}' not found`);
      }

      if (existing.status !== VacancyStatus.PENDING_APPROVAL) {
        throw new BadRequestException(
          `Only vacancies in PENDING_APPROVAL status can be reviewed (current: ${existing.status})`,
        );
      }

      // Self-approval prevention
      if (existing.requestedByUserId === actorUserId) {
        throw new ForbiddenException(
          'Self-approval is not permitted: you cannot approve or review your own vacancy request',
        );
      }

      // Mandatory rejection rationale (SEC-VAC-002)
      if (dto.action === 'REJECT') {
        const trimmed = dto.reviewNote?.trim();
        if (!trimmed || trimmed.length === 0) {
          throw new BadRequestException(
            'A non-empty review note is required when rejecting a vacancy requisition.',
          );
        }
      }

      const targetStatus =
        dto.action === 'APPROVE' ? VacancyStatus.APPROVED : VacancyStatus.REJECTED;

      const updated = await tx.vacancy.update({
        where: { id },
        data: {
          status: targetStatus,
          reviewedByUserId: actorUserId,
          reviewedAt: new Date(),
          reviewNote: dto.reviewNote?.trim() || null,
        },
        include: {
          department: true,
          role: true,
          requestedBy: {
            select: {
              id: true,
              email: true,
              employee: {
                select: { firstName: true, lastName: true },
              },
            },
          },
          reviewedBy: {
            select: {
              id: true,
              email: true,
              employee: {
                select: { firstName: true, lastName: true },
              },
            },
          },
        },
      });

      await this.auditService.recordInTx(tx, {
        entityType: 'Vacancy',
        entityId: id,
        action: dto.action === 'APPROVE' ? 'VACANCY_APPROVED' : 'VACANCY_REJECTED',
        actorUserId,
        oldValue: { status: existing.status },
        newValue: { status: updated.status, reviewNote: updated.reviewNote },
        reason: dto.reviewNote || `Vacancy request was ${dto.action.toLowerCase()}d`,
      });

      return updated;
    });
  }

  /**
   * Transition vacancy status according to lifecycle rules.
   * SEC-VAC-003: Enforces headcount ceiling (filledHeadcount <= targetHeadcount).
   */
  async transitionStatus(
    id: string,
    dto: TransitionVacancyStatusDto,
    actorUserId: string,
  ): Promise<Vacancy> {
    return this.prisma.$transaction(async (tx) => {
      await this.acquireVacancyLock(tx, id);

      const existing = await tx.vacancy.findUnique({
        where: { id },
      });
      if (!existing) {
        throw new NotFoundException(`Vacancy with ID '${id}' not found`);
      }

      const allowedNext = ALLOWED_STATUS_TRANSITIONS[existing.status] || [];
      if (!allowedNext.includes(dto.status)) {
        throw new BadRequestException(
          `Cannot transition vacancy from '${existing.status}' to '${dto.status}'. Allowed transitions: ${
            allowedNext.length > 0 ? allowedNext.join(', ') : 'none (terminal status)'
          }`,
        );
      }

      // Headcount bounds validation (SEC-VAC-003)
      let filledHeadcount = existing.filledHeadcount;
      if (dto.filledHeadcount !== undefined) {
        if (dto.filledHeadcount < 0) {
          throw new BadRequestException('filledHeadcount cannot be negative.');
        }
        if (dto.filledHeadcount > existing.targetHeadcount) {
          throw new BadRequestException(
            `filledHeadcount (${dto.filledHeadcount}) cannot exceed targetHeadcount (${existing.targetHeadcount}).`,
          );
        }
        filledHeadcount = dto.filledHeadcount;
      } else if (dto.status === VacancyStatus.FILLED && existing.filledHeadcount < existing.targetHeadcount) {
        filledHeadcount = existing.targetHeadcount;
      }

      if (dto.status === VacancyStatus.FILLED && filledHeadcount < existing.targetHeadcount) {
        filledHeadcount = existing.targetHeadcount;
      }

      const updated = await tx.vacancy.update({
        where: { id },
        data: {
          status: dto.status,
          filledHeadcount,
          notes: dto.note ? `${existing.notes ? existing.notes + '\n' : ''}[${new Date().toISOString()}] ${dto.note}` : undefined,
        },
        include: {
          department: true,
          role: true,
          requestedBy: {
            select: {
              id: true,
              email: true,
              employee: {
                select: { firstName: true, lastName: true },
              },
            },
          },
          reviewedBy: {
            select: {
              id: true,
              email: true,
              employee: {
                select: { firstName: true, lastName: true },
              },
            },
          },
        },
      });

      await this.auditService.recordInTx(tx, {
        entityType: 'Vacancy',
        entityId: id,
        action: 'VACANCY_STATUS_CHANGED',
        actorUserId,
        oldValue: { status: existing.status, filledHeadcount: existing.filledHeadcount },
        newValue: { status: updated.status, filledHeadcount: updated.filledHeadcount },
        reason: dto.note || `Vacancy status transitioned to ${dto.status}`,
      });

      return updated;
    });
  }

  /**
   * Get single vacancy by ID.
   */
  async getVacancy(id: string): Promise<Vacancy> {
    const vacancy = await this.prisma.vacancy.findUnique({
      where: { id },
      include: {
        department: true,
        role: true,
        requestedBy: {
          select: {
            id: true,
            email: true,
            employee: {
              select: { firstName: true, lastName: true },
            },
          },
        },
        reviewedBy: {
          select: {
            id: true,
            email: true,
            employee: {
              select: { firstName: true, lastName: true },
            },
          },
        },
      },
    });

    if (!vacancy) {
      throw new NotFoundException(`Vacancy with ID '${id}' not found`);
    }

    return vacancy;
  }

  /**
   * List vacancies with optional filters and pagination.
   */
  async getVacancies(query: QueryVacanciesDto) {
    const page = Math.max(1, query.page || 1);
    const limit = Math.max(1, Math.min(100, query.limit || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.VacancyWhereInput = {};

    if (query.departmentId) {
      where.departmentId = query.departmentId;
    }
    if (query.roleId) {
      where.roleId = query.roleId;
    }
    if (query.status) {
      where.status = query.status;
    }
    if (query.priority) {
      where.priority = query.priority;
    }
    if (query.search && query.search.trim().length > 0) {
      const term = query.search.trim();
      where.OR = [
        { title: { contains: term, mode: 'insensitive' } },
        { businessId: { contains: term, mode: 'insensitive' } },
        { justification: { contains: term, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.vacancy.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ createdAt: 'desc' }],
        include: {
          department: true,
          role: true,
          requestedBy: {
            select: {
              id: true,
              email: true,
              employee: {
                select: { firstName: true, lastName: true },
              },
            },
          },
          reviewedBy: {
            select: {
              id: true,
              email: true,
              employee: {
                select: { firstName: true, lastName: true },
              },
            },
          },
        },
      }),
      this.prisma.vacancy.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }
}
