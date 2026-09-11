import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

/**
 * IdGeneratorService — generates human-readable business IDs.
 *
 * Format: PREFIX-NNNN (e.g., EMP-0001, STU-0042, CLS-0100)
 *
 * R-4 HARDENING:
 *   The public nextId() method has been REMOVED. It created a separate transaction
 *   for the sequence increment, which could produce ID gaps if the caller's
 *   business transaction subsequently failed.
 *
 *   ALL callers MUST use nextIdInTx() inside the same transaction as the
 *   business record creation. This guarantees:
 *     - No ID gaps caused by failed outer transactions.
 *     - No race conditions between ID allocation and record insertion.
 *     - The sequence increment and record creation are atomic.
 *
 * CORRECT USAGE:
 *   await prisma.$transaction(async (tx) => {
 *     const businessId = await idGenerator.nextIdInTx(tx, 'EMP');
 *     await tx.employee.create({ data: { businessId, ...rest } });
 *   });
 *
 * INCORRECT (removed, do not re-introduce):
 *   const businessId = await idGenerator.nextId('EMP');  // ← gap risk
 *   await prisma.employee.create({ data: { businessId, ...rest } });
 *
 * NOTE ON SEED SCRIPTS:
 *   Seed scripts may use raw Prisma sequence operations directly since they
 *   run in a controlled environment where gap tolerance is acceptable.
 *   Application business code must always use nextIdInTx().
 */
@Injectable()
export class IdGeneratorService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generates and returns the next human-readable business ID for the given
   * entity type, within the provided Prisma transaction.
   *
   * The sequence row is updated (increment) and the resulting ID is returned.
   * This operation serializes concurrent requests via PostgreSQL row-level locking.
   *
   * @param tx         The Prisma interactive transaction client.
   * @param entityType The sequence entity type key (e.g. 'EMP', 'STU', 'LED').
   * @returns          The formatted business ID string (e.g. 'EMP-0001').
   *
   * @example
   *   await prisma.$transaction(async (tx) => {
   *     const businessId = await idGenerator.nextIdInTx(tx, 'STU');
   *     await tx.student.create({ data: { businessId, ...studentData } });
   *   });
   */
  async nextIdInTx(
    tx: Parameters<Parameters<PrismaService['$transaction']>[0]>[0],
    entityType: string,
  ): Promise<string> {
    const sequence = await tx.sequence.update({
      where: { entityType },
      data: { nextNumber: { increment: 1 } },
    });

    // The updated record returns the NEW nextNumber (after increment).
    // The issued number is nextNumber - 1 (the value before the increment).
    const issuedNumber = sequence.nextNumber - 1;
    const padded = String(issuedNumber).padStart(sequence.padding, '0');
    return `${sequence.prefix}-${padded}`;
  }
}
