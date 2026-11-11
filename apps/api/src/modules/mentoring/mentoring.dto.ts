import { ChecklistItemState, MentoringStaffRole, MentoringTaskPriority, MentoringTaskStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDate,
  IsDefined,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,

  Max,
  Min,
} from 'class-validator';

export class StudentListQueryDto {
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsInt() @Min(1) @Max(7) stage?: number;
  @IsOptional() @IsString() mentorUserId?: string;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsInt() @Min(1) page?: number;
  @IsOptional() @IsInt() @Min(1) @Max(100) pageSize?: number;
}

export class UpdateChecklistItemDto {
  @IsOptional() @IsEnum(ChecklistItemState) state?: ChecklistItemState;
  @IsOptional() value?: unknown;
  @IsOptional() @IsString() note?: string | null;
  @IsOptional() @IsString() reason?: string | null;
  @IsOptional() @IsString() evidenceRef?: string | null;
}

/** One admission-handover field. The value's shape depends on the field and is validated against its definition. */
export class UpdateHandoverFieldDto {
  @IsDefined() value!: unknown;
  /**
   * The value the Mentor was looking at when editing (null when the field was empty). The save is refused if the stored
   * value has changed since. Omit it to skip the check.
   */
  @IsOptional() basedOn?: unknown;
}

/** Confirm (verified: true) or withdraw the confirmation of one field during the parent meeting. */
export class SetFieldVerificationDto {
  @IsBoolean() verified!: boolean;
  @IsOptional() @IsString() note?: string;
  /** The value the Mentor confirmed on screen. Confirming is refused if the stored value has changed since. */
  @IsOptional() basedOn?: unknown;
}

/** A student's timetable for a range of dates. The rules for the range are checked by the timetable service. */
export class TimetableQueryDto {
  @IsString() @IsNotEmpty() view!: string;
  @IsString() @IsNotEmpty() from!: string;
  @IsOptional() @IsString() to?: string;
}

/** Filters for the daily classes. Each one is checked by the service, which says what is wrong. */
export class ClassQueryDto {
  @IsOptional() @IsString() date?: string;
  @IsOptional() @IsString() subjectId?: string;
  @IsOptional() @IsString() tutorProfileId?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() state?: string;
  @IsOptional() @IsString() activationId?: string;
  @IsOptional() @IsString() from?: string;
  @IsOptional() @IsString() to?: string;
  @IsOptional() @IsString() limit?: string;
}

/** Filters for one student's exams. Each one is checked by the service, which says what is wrong. */
export class ExamQueryDto {
  @IsOptional() @IsString() subjectId?: string;
  @IsOptional() @IsString() state?: string;
  @IsOptional() @IsString() kind?: string;
  @IsOptional() @IsString() tutorUserId?: string;
  @IsOptional() @IsString() from?: string;
  @IsOptional() @IsString() to?: string;
  @IsOptional() @IsString() limit?: string;
}

/** Filters for the Mentoring overview. Each one is checked by the service, which says what is wrong. */
export class OverviewQueryDto {
  @IsOptional() @IsString() period?: string;
  @IsOptional() @IsString() date?: string;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() mentorUserId?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() subjectId?: string;
  @IsOptional() @IsString() sort?: string;
  @IsOptional() @IsString() dir?: string;
  @IsOptional() @IsString() page?: string;
  @IsOptional() @IsString() pageSize?: string;
}

/** Filters for the Mentor dashboard. Each one is checked by the service, which says what is wrong. */
export class DashboardQueryDto {
  @IsOptional() @IsString() studentQuery?: string;
  @IsOptional() @IsString() activationId?: string;
  @IsOptional() @IsString() subjectId?: string;
  @IsOptional() @IsString() tutorProfileId?: string;
  @IsOptional() @IsString() tutorUserId?: string;
  @IsOptional() @IsString() period?: string;
  @IsOptional() @IsString() date?: string;
  @IsOptional() @IsString() from?: string;
  @IsOptional() @IsString() to?: string;
  @IsOptional() @IsString() classState?: string;
  @IsOptional() @IsString() examState?: string;
  @IsOptional() @IsString() meetingState?: string;
  @IsOptional() @IsString() complaintCategory?: string;
  @IsOptional() @IsString() complaintStatus?: string;
  @IsOptional() @IsString() priority?: string;
  @IsOptional() @IsString() slaState?: string;
  @IsOptional() @IsString() page?: string;
  @IsOptional() @IsString() pageSize?: string;
}

/** Filters for parent complaints. Each one is checked by the service, which says what is wrong. */
export class ComplaintQueryDto {
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() stage?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() priority?: string;
  @IsOptional() @IsString() sla?: string;
  @IsOptional() @IsString() activationId?: string;
  @IsOptional() @IsString() assignedToUserId?: string;
  @IsOptional() @IsString() mine?: string;
  @IsOptional() @IsString() from?: string;
  @IsOptional() @IsString() to?: string;
  @IsOptional() @IsString() limit?: string;
}

/** Filters for the response-time list. Each one is checked by the service, which says what is wrong. */
export class SlaQueryDto {
  @IsOptional() @IsString() policyKey?: string;
  @IsOptional() @IsString() state?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() activationId?: string;
  @IsOptional() @IsString() responsibleUserId?: string;
  @IsOptional() @IsString() from?: string;
  @IsOptional() @IsString() to?: string;
  @IsOptional() @IsString() limit?: string;
}

/** One subject's learning plan. Every field is checked by the learning plan service, which explains what is wrong. */
export class SaveSubjectPlanDto {
  @IsOptional() description?: unknown;
  @IsOptional() objectives?: unknown;
  @IsOptional() topics?: unknown;
  @IsOptional() outcomes?: unknown;
  @IsOptional() startsOn?: unknown;
  @IsOptional() endsOn?: unknown;
  @IsOptional() reason?: unknown;
}

/** Choose the tutor for one subject of the student's schedule. The server checks every session again. */
export class AssignTutorDto {
  @IsString() @IsNotEmpty() tutorProfileId!: string;
}

export class RemoveTutorDto {
  @IsOptional() @IsString() reason?: string;
}

export class PauseDto {
  @IsString() @IsNotEmpty() reason!: string;
  @IsString() @IsNotEmpty() pendingAction!: string;
  @IsString() @IsNotEmpty() responsibleUserId!: string;
  @Type(() => Date) @IsDate() followUpAt!: Date;
}

export class BlockDto {
  @IsString() @IsNotEmpty() reason!: string;
  @IsString() @IsNotEmpty() dependency!: string;
  @IsString() @IsNotEmpty() responsibleUserId!: string;
  @Type(() => Date) @IsDate() followUpAt!: Date;
}

export class ResumeDto {
  @IsOptional() @IsString() resolution?: string;
}

export class ExceptionDto {
  @IsString() @IsNotEmpty() reason!: string;
}

export class ApprovalDecisionDto {
  @IsIn(['APPROVED', 'RETURNED']) decision!: 'APPROVED' | 'RETURNED';
  @IsOptional() @IsString() comment?: string;
  @IsOptional() @IsInt() @Min(1) @Max(7) returnToStage?: number;
}

export class CancelDto {
  @IsString() @IsNotEmpty() reason!: string;
}

// ─── Allocation / staff ──────────────────────────────────────────────────────

export class AssignMentorDto {
  @IsString() @IsNotEmpty() mentorUserId!: string;
  @IsOptional() @IsString() reason?: string;
  @IsOptional() @IsString() overCapacityReason?: string;
}

export class ReassignMentorDto {
  @IsString() @IsNotEmpty() mentorUserId!: string;
  @IsString() @IsNotEmpty() reason!: string;
  @IsOptional() @IsString() overCapacityReason?: string;
}

export class TransferMentorDto {
  @IsString() @IsNotEmpty() mentorUserId!: string;
  @IsString() @IsNotEmpty() reason!: string;
  @Type(() => Date) @IsDate() expectedReturnAt!: Date;
}

export class ReturnToQueueDto {
  @IsString() @IsNotEmpty() reason!: string;
}

export class UpdateSettingsDto {
  @IsOptional() @IsIn(['AUTO', 'MANUAL']) allocationMode?: 'AUTO' | 'MANUAL';
  @IsOptional() @IsInt() @Min(1) @Max(500) defaultCapacity?: number;
  @IsOptional() @IsBoolean() siblingAffinity?: boolean;
}

export class UpsertStaffDto {
  @IsEnum(MentoringStaffRole) role!: MentoringStaffRole;
  @IsOptional() @IsInt() @Min(1) @Max(500) capacity?: number | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsBoolean() acceptsAllocation?: boolean;
  @IsOptional() @IsString() team?: string | null;
  @IsOptional() @IsString() notes?: string | null;
}

// ─── Tasks ───────────────────────────────────────────────────────────────────

export class CreateTaskDto {
  @IsString() @IsNotEmpty() activationId!: string;
  @IsOptional() @IsInt() @Min(1) @Max(7) stageNumber?: number;
  @IsString() @IsNotEmpty() title!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsEnum(MentoringTaskPriority) priority?: MentoringTaskPriority;
  @IsOptional() @Type(() => Date) @IsDate() dueAt?: Date;
  @IsString() @IsNotEmpty() assigneeUserId!: string;
}

export class TaskListQueryDto {
  @IsOptional() @IsIn(['assigned', 'created', 'all']) scope?: 'assigned' | 'created' | 'all';
  @IsOptional() @IsEnum(MentoringTaskStatus) status?: MentoringTaskStatus;
  @IsOptional() @IsString() activationId?: string;
}

export class TaskCommentDto {
  @IsString() @IsNotEmpty() body!: string;
}

export class TaskCollectDto {
  @IsString() @IsNotEmpty() itemKey!: string;
  @IsOptional() value?: unknown;
  @IsOptional() @IsString() note?: string;
  @IsOptional() @IsString() evidenceRef?: string;
}

export class TaskSubmitDto {
  @IsOptional() @IsString() note?: string;
  @IsOptional() @IsString() evidence?: string;
}

export class TaskReasonDto {
  @IsString() @IsNotEmpty() reason!: string;
}

