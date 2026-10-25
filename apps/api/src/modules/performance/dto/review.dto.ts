import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import {
  PerformanceReviewStatus,
  PerformanceReviewType,
  ReviewAcknowledgementStatus,
} from '@prisma/client';

export class CreatePerformanceReviewDto {
  @ApiProperty({ description: 'Target employee ID' })
  @IsUUID('4', { message: 'employeeId must be a valid UUID v4' })
  @IsNotEmpty()
  employeeId!: string;

  @ApiPropertyOptional({ description: 'Optional cycle ID' })
  @IsOptional()
  @IsUUID('4')
  cycleId?: string;

  @ApiPropertyOptional({ description: 'Reviewer employee ID (defaults to employee reporting manager or actor)' })
  @IsOptional()
  @IsUUID('4')
  reviewerId?: string;

  @ApiProperty({ description: 'Review period (e.g. 2026-10 or Q4-2026)', example: '2026-10' })
  @IsString()
  @IsNotEmpty()
  period!: string;

  @ApiPropertyOptional({ enum: PerformanceReviewType, default: PerformanceReviewType.MONTHLY })
  @IsOptional()
  @IsEnum(PerformanceReviewType)
  reviewType?: PerformanceReviewType;
}

export class UpdateSelfReviewDto {
  @ApiProperty({ description: 'Employee self-assessment and reflections', example: 'Achieved my core targets and completed onboarding handover.' })
  @IsString()
  @IsNotEmpty()
  employeeComments!: string;
}

export class EvaluatePerformanceReviewDto {
  @ApiPropertyOptional({ description: 'Overall rating (1 = Unsatisfactory, 2 = Needs Improvement, 3 = Meets Expectations, 4 = Exceeds Expectations, 5 = Outstanding)', minimum: 1, maximum: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  @ApiPropertyOptional({ description: 'Key strengths and accomplishments' })
  @IsOptional()
  @IsString()
  strengths?: string;

  @ApiPropertyOptional({ description: 'Areas requiring improvement or skill development' })
  @IsOptional()
  @IsString()
  areasForImprovement?: string;

  @ApiPropertyOptional({ description: 'Assessment of work quality and accuracy' })
  @IsOptional()
  @IsString()
  qualityAssessment?: string;

  @ApiPropertyOptional({ description: 'Assessment of competencies, teamwork, and compliance' })
  @IsOptional()
  @IsString()
  competencyAssessment?: string;

  @ApiPropertyOptional({ description: 'Manager written feedback shared with employee' })
  @IsOptional()
  @IsString()
  managerFeedback?: string;

  @ApiPropertyOptional({ description: 'Confidential internal notes (restricted to management/HR; stripped for employee)' })
  @IsOptional()
  @IsString()
  confidentialNotes?: string;

  @ApiPropertyOptional({ description: 'Recommended training or development assignments' })
  @IsOptional()
  @IsString()
  recommendedTraining?: string;

  @ApiPropertyOptional({ description: 'Whether a Performance Improvement Plan (PIP) is recommended' })
  @IsOptional()
  @IsBoolean()
  pipRecommended?: boolean;

  @ApiPropertyOptional({ enum: PerformanceReviewStatus, description: 'Transition status (e.g. SELF_REVIEW, MANAGER_REVIEW, IN_DISCUSSION)' })
  @IsOptional()
  @IsEnum(PerformanceReviewStatus)
  status?: PerformanceReviewStatus;
}

export class FinalizePerformanceReviewDto {
  @ApiProperty({ description: 'Final rating (1 to 5)', minimum: 1, maximum: 5, example: 4 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @ApiProperty({ description: 'Final manager feedback shared with the employee', example: 'Consistently exceeded expectations in timely student outreach.' })
  @IsString()
  @IsNotEmpty()
  managerFeedback!: string;

  @ApiProperty({ description: 'Documented strengths and achievements' })
  @IsString()
  @IsNotEmpty()
  strengths!: string;

  @ApiProperty({ description: 'Documented areas requiring improvement' })
  @IsString()
  @IsNotEmpty()
  areasForImprovement!: string;

  @ApiPropertyOptional({ description: 'Work quality evaluation' })
  @IsOptional()
  @IsString()
  qualityAssessment?: string;

  @ApiPropertyOptional({ description: 'Competencies evaluation' })
  @IsOptional()
  @IsString()
  competencyAssessment?: string;

  @ApiPropertyOptional({ description: 'Confidential internal notes (never visible to employee)' })
  @IsOptional()
  @IsString()
  confidentialNotes?: string;

  @ApiPropertyOptional({ description: 'Recommended training or development initiatives' })
  @IsOptional()
  @IsString()
  recommendedTraining?: string;

  @ApiPropertyOptional({ description: 'Whether a PIP is recommended' })
  @IsOptional()
  @IsBoolean()
  pipRecommended?: boolean;
}

export class AcknowledgePerformanceReviewDto {
  @ApiProperty({ enum: ReviewAcknowledgementStatus, example: ReviewAcknowledgementStatus.ACKNOWLEDGED })
  @IsEnum(ReviewAcknowledgementStatus)
  @IsNotEmpty()
  status!: ReviewAcknowledgementStatus;

  @ApiPropertyOptional({ description: 'Employee comments or context upon acknowledgement' })
  @IsOptional()
  @IsString()
  comments?: string;
}

export class AmendPerformanceReviewDto {
  @ApiProperty({ description: 'Mandatory justification for amending a completed performance review', example: 'Corrected Q3 KPI score following verified CRM data reconciliation.' })
  @IsString()
  @IsNotEmpty()
  reason!: string;

  @ApiPropertyOptional({ description: 'New rating (1 to 5)', minimum: 1, maximum: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  newRating?: number;

  @ApiPropertyOptional({ description: 'Updated manager feedback' })
  @IsOptional()
  @IsString()
  managerFeedback?: string;

  @ApiPropertyOptional({ description: 'Updated strengths' })
  @IsOptional()
  @IsString()
  strengths?: string;

  @ApiPropertyOptional({ description: 'Updated areas for improvement' })
  @IsOptional()
  @IsString()
  areasForImprovement?: string;

  @ApiPropertyOptional({ description: 'Updated confidential notes' })
  @IsOptional()
  @IsString()
  confidentialNotes?: string;
}
