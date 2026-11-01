import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { RbacService } from '../../common/rbac/rbac.service';

export interface MentoringScope {
  userId: string;
  perms: ReadonlySet<string>;
  /** Department-wide visibility (Mentoring Head, CEO). */
  all: boolean;
  /** Visibility limited to own students (Mentor) or students with an assigned task (Demo Counselor). */
  assigned: boolean;
}

/**
 * Central place for who can see which student. Scoping is applied in database queries; callers never
 * filter results in memory.
 */
@Injectable()
export class MentoringAccessService {
  constructor(private readonly rbac: RbacService) {}

  async scopeFor(userId: string): Promise<MentoringScope> {
    const perms = await this.rbac.getPermissionsForUser(userId);
    return {
      userId,
      perms,
      all: perms.has('mentoring.student.read-all'),
      assigned: perms.has('mentoring.student.read-assigned'),
    };
  }

  /** Read endpoints accept either scope, so they are authorised here rather than by a single route permission. */
  requireAnyScope(scope: MentoringScope): void {
    if (!scope.all && !scope.assigned) {
      throw new ForbiddenException('You do not have access to Mentoring students');
    }
  }

  visibilityWhere(scope: MentoringScope): Prisma.MentoringActivationWhereInput {
    this.requireAnyScope(scope);
    if (scope.all) return {};
    return {
      OR: [
        { currentMentorUserId: scope.userId },
        { tasks: { some: { assigneeUserId: scope.userId } } },
      ],
    };
  }

  /** Parent contact details are only for the department head, CEO and the assigned Mentor. */
  canSeeParentContact(scope: MentoringScope, activation: { currentMentorUserId: string | null }): boolean {
    return scope.all || activation.currentMentorUserId === scope.userId;
  }
}
