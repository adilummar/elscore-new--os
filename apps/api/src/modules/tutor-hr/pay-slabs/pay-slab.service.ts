import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { AuditService } from '../../../common/audit/audit.service';
import { PrismaService, PrismaTxClient } from '../../../common/prisma/prisma.service';

import { PAY_SLAB_GRADE_CODES } from './pay-slab.constants';
import { CreatePaySlabDto } from './pay-slab.dto';
import { PaySlabView, SLAB_WITH_RATES, toPaySlabView } from './pay-slab.mapper';

/**
 * Salary slabs: create and read only. There is deliberately no update or delete here, and the database
 * refuses both as well (migration 20261124100000_pay_slab_grade_rates).
 */
@Injectable()
export class PaySlabService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Every slab with the number of tutors on it this month (cancelled and future rows are not counted). */
  async list(): Promise<Array<PaySlabView & { currentTutors: number }>> {
    const rows = await this.prisma.tutorSalarySlab.findMany({
      orderBy: { name: 'asc' },
      select: SLAB_WITH_RATES,
    });
    const counts = await this.prisma.$queryRaw<Array<{ slab_id: string; n: number }>>`
      SELECT slab_id, COUNT(*)::int AS n
      FROM tutor_slab_assignments
      WHERE cancelled_at IS NULL
        AND from_month <= tutor_slab_current_month()
        AND (to_month IS NULL OR to_month >= tutor_slab_current_month())
      GROUP BY slab_id`;
    const byId = new Map(counts.map((c) => [c.slab_id, c.n]));
    return rows.map((r) => ({ ...toPaySlabView(r), currentTutors: byId.get(r.id) ?? 0 }));
  }

  async get(id: string): Promise<PaySlabView> {
    const row = await this.prisma.tutorSalarySlab.findUnique({
      where: { id },
      select: SLAB_WITH_RATES,
    });
    if (!row) throw new NotFoundException('Salary slab not found');
    return toPaySlabView(row);
  }

  /** The slab and all 13 rates are written in one transaction: either everything exists or nothing does. */
  async create(dto: CreatePaySlabDto, actorUserId: string): Promise<PaySlabView> {
    const name = dto.name.trim();
    const rates = this.validateRates(dto);

    let id: string;
    try {
      id = await this.prisma.$transaction(async (tx: PrismaTxClient) => {
        const clash = await tx.tutorSalarySlab.findFirst({
          where: { name: { equals: name, mode: 'insensitive' } },
          select: { name: true },
        });
        if (clash) {
          throw new ConflictException(
            `A salary slab named "${clash.name}" already exists (names are not case-sensitive)`,
          );
        }

        const grades = await tx.grade.findMany({
          where: { code: { in: [...PAY_SLAB_GRADE_CODES] } },
          select: { id: true, code: true },
        });
        if (grades.length !== PAY_SLAB_GRADE_CODES.length) {
          throw new BadRequestException(
            'The grade list is incomplete on this system; run the seed before creating slabs',
          );
        }
        const gradeId = new Map(grades.map((g) => [g.code, g.id]));

        const slab = await tx.tutorSalarySlab.create({
          // hourlyRate is the legacy single-rate column (still NOT NULL); the lowest grade rate is stored there.
          data: { name, currency: dto.currency, hourlyRate: Math.min(...rates.map((r) => r.rate)) },
          select: { id: true },
        });
        await tx.tutorSalarySlabRate.createMany({
          data: rates.map((r) => ({
            slabId: slab.id,
            gradeId: gradeId.get(r.gradeCode)!,
            rate: r.rate,
          })),
        });
        await this.audit.recordInTx(tx, {
          entityType: 'TutorSalarySlab',
          entityId: slab.id,
          action: 'PAY_SLAB_CREATED',
          actorUserId,
          newValue: {
            name,
            currency: dto.currency,
            rates: Object.fromEntries(rates.map((r) => [r.gradeCode, r.rate])),
          },
        });
        return slab.id;
      });
    } catch (e) {
      // Two people saving the same exact name at once: the unique index answers.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException(
          `A salary slab named "${name}" already exists (names are not case-sensitive)`,
        );
      }
      throw e;
    }
    return this.get(id);
  }

  /** Exactly the 13 grades KG..Grade 12, each once, each with a positive rate. */
  private validateRates(dto: CreatePaySlabDto): Array<{ gradeCode: string; rate: number }> {
    const seen = new Set<string>();
    for (const r of dto.rates) {
      if (!(PAY_SLAB_GRADE_CODES as readonly string[]).includes(r.gradeCode)) {
        throw new BadRequestException(
          `Unknown grade "${r.gradeCode}". Slabs price KG to Grade 12 only`,
        );
      }
      if (seen.has(r.gradeCode))
        throw new BadRequestException(`Grade ${r.gradeCode} appears more than once`);
      seen.add(r.gradeCode);
    }
    const missing = PAY_SLAB_GRADE_CODES.filter((c) => !seen.has(c));
    if (missing.length) {
      throw new BadRequestException(
        `A slab needs a rate for every grade KG to Grade 12. Missing: ${missing.join(', ')}`,
      );
    }
    return dto.rates.map((r) => ({ gradeCode: r.gradeCode, rate: r.rate }));
  }
}
