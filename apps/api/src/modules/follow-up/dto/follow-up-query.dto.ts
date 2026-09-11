import { FollowUpStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class FollowUpQueryDto {
  /**
   * today    — FUPs scheduled today
   * upcoming — FUPs scheduled in the future (SCHEDULED only)
   * overdue  — FUPs with status OVERDUE
   * all      — no date filter
   */
  @IsIn(['today', 'upcoming', 'overdue', 'all'])
  @IsOptional()
  view?: 'today' | 'upcoming' | 'overdue' | 'all';

  /** Filter by a specific Lead ID. */
  @IsUUID()
  @IsOptional()
  leadId?: string;

  /** Sales Head only: filter by a specific owner's userId. */
  @IsUUID()
  @IsOptional()
  ownerUserId?: string;

  @IsIn(['SCHEDULED', 'OVERDUE', 'COMPLETED'])
  @IsOptional()
  status?: FollowUpStatus;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number;

  @IsString()
  @IsOptional()
  cursor?: string;
}
