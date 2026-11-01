import { BadRequestException, Injectable } from '@nestjs/common';
import { MentoringStaffRole } from '@prisma/client';

import { PrismaService, PrismaTxClient } from '../../common/prisma/prisma.service';

import { MentoringHistoryService } from './mentoring-history.service';
import { DEMO_COUNSELOR_ROLE_CODE, MENTOR_ROLE_CODE } from './mentoring.constants';

const ROLE_CODE: Record<MentoringStaffRole, string> = {
  MENTOR: MENTOR_ROLE_CODE,
  DEMO_COUNSELOR: DEMO_COUNSELOR_ROLE_CODE,
};

export interface UpsertStaffDto {
  role: MentoringStaffRole;
  capacity?: number | null;
  isActive?: boolean;
  acceptsAllocation?: boolean;
  team?: string | null;
  notes?: string | null;
}

@Injectable()
export class MentoringStaffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly history: MentoringHistoryService,
  ) {}

  async list(role?: MentoringStaffRole) {
    const profiles = await this.prisma.mentoringStaffProfile.findMany({
      where: role ? { role } : {},
      orderBy: { createdAt: 'asc' },
    });
    const employees = await this.prisma.employee.findMany({
      where: { userId: { in: profiles.map((p) => p.userId) } },
      select: { userId: true, firstName: true, lastName: true, employmentStatus: true },
    });
    const byUser = new Map(employees.map((e) => [e.userId, e]));
    return profiles.map((p) => ({
      ...p,
      name: byUser.get(p.userId) ? `${byUser.get(p.userId)!.firstName} ${byUser.get(p.userId)!.lastName}` : null,
      employmentStatus: byUser.get(p.userId)?.employmentStatus ?? null,
    }));
  }

  /** Names of active Demo Counselors, for the task assignment picker used by Mentors and the Head. */
  async listCounselors() {
    const profiles = await this.prisma.mentoringStaffProfile.findMany({ where: { role: 'DEMO_COUNSELOR', isActive: true } });
    const employees = await this.prisma.employee.findMany({
      where: { userId: { in: profiles.map((p) => p.userId) } },
      select: { userId: true, firstName: true, lastName: true },
    });
    const byUser = new Map(employees.map((e) => [e.userId, e]));
    return profiles.map((p) => ({
      userId: p.userId,
      name: byUser.get(p.userId) ? `${byUser.get(p.userId)!.firstName} ${byUser.get(p.userId)!.lastName}` : p.userId,
    }));
  }

  /** The user must already hold the matching role (role assignment stays in the existing user management). */
  async upsert(userId: string, dto: UpsertStaffDto, actorUserId: string) {
    if (dto.role === 'DEMO_COUNSELOR' && (dto.capacity !== undefined && dto.capacity !== null)) {
      throw new BadRequestException('Capacity applies to Mentors only');
    }
    if ((dto.capacity !== undefined && dto.capacity !== null) && dto.capacity < 1) throw new BadRequestException('Capacity must be at least 1');

    return this.prisma.$transaction(async (tx: PrismaTxClient) => {
      const roleCount = await tx.userRole.count({ where: { userId, role: { code: ROLE_CODE[dto.role] } } });
      if (!roleCount) {
        throw new BadRequestException(`The user does not hold the ${ROLE_CODE[dto.role]} role. Assign the role first.`);
      }
      const before = await tx.mentoringStaffProfile.findUnique({ where: { userId } });
      const saved = await tx.mentoringStaffProfile.upsert({
        where: { userId },
        create: {
          userId,
          role: dto.role,
          capacity: dto.capacity ?? null,
          isActive: dto.isActive ?? true,
          acceptsAllocation: dto.acceptsAllocation ?? true,
          team: dto.team ?? null,
          notes: dto.notes ?? null,
        },
        update: {
          role: dto.role,
          ...(dto.capacity !== undefined ? { capacity: dto.capacity } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
          ...(dto.acceptsAllocation !== undefined ? { acceptsAllocation: dto.acceptsAllocation } : {}),
          ...(dto.team !== undefined ? { team: dto.team } : {}),
          ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        },
      });
      await tx.auditEvent.create({
        data: {
          entityType: 'MentoringStaffProfile',
          entityId: saved.id,
          action: before ? 'UPDATE' : 'CREATE',
          actorUserId,
          oldValue: (before ?? undefined) as never,
          newValue: saved as never,
        },
      });
      return saved;
    });
  }
}
