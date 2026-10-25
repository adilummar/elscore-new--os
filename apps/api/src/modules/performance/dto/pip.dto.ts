import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  ValidateNested,
} from 'class-validator';
import { PipObjectiveStatus, PipStatus } from '@prisma/client';

export class CreatePipObjectiveDto {
  @ApiProperty({ description: 'Objective title', example: 'Complete 30 outreach calls per day with 90% SLA adherence' })
  @IsString()
  @IsNotEmpty()
  title!: string;

  @ApiProperty({ description: 'Measurable success criteria', example: 'Verified daily in outreach report with zero unhandled escalations' })
  @IsString()
  @IsNotEmpty()
  successCriteria!: string;

  @ApiProperty({ description: 'Target date (YYYY-MM-DD)', example: '2026-11-30' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'targetDate must match YYYY-MM-DD format' })
  targetDate!: string;
}

export class CreatePipDto {
  @ApiProperty({ description: 'Target employee ID' })
  @IsUUID('4', { message: 'employeeId must be a valid UUID v4' })
  @IsNotEmpty()
  employeeId!: string;

  @ApiPropertyOptional({ description: 'Optional linked performance review ID' })
  @IsOptional()
  @IsUUID('4')
  reviewId?: string;

  @ApiPropertyOptional({ description: 'Managing employee ID (defaults to employee reporting manager or actor)' })
  @IsOptional()
  @IsUUID('4')
  managerId?: string;

  @ApiProperty({ description: 'Reason for placing employee on PIP', example: 'Persistent gap in meeting SLA requirements over consecutive review periods.' })
  @IsString()
  @IsNotEmpty()
  reason!: string;

  @ApiProperty({ description: 'Specific documented performance gap', example: 'Lead response time averaged 4.2 hours against 1-hour policy threshold.' })
  @IsString()
  @IsNotEmpty()
  performanceGap!: string;

  @ApiProperty({ description: 'Expected standard of performance', example: 'Achieve and maintain average response time under 45 minutes.' })
  @IsString()
  @IsNotEmpty()
  expectedStandard!: string;

  @ApiProperty({ description: 'Support, resources, or training provided to employee', example: 'Daily 15-minute morning check-ins and CRM prioritization coaching.' })
  @IsString()
  @IsNotEmpty()
  supportProvided!: string;

  @ApiProperty({ description: 'Start date of PIP (YYYY-MM-DD)', example: '2026-11-01' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'startDate must match YYYY-MM-DD format' })
  startDate!: string;

  @ApiProperty({ description: 'Target completion date (YYYY-MM-DD)', example: '2026-12-01' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'targetCompletionDate must match YYYY-MM-DD format' })
  targetCompletionDate!: string;

  @ApiPropertyOptional({ description: 'Intermediate review check-in date (YYYY-MM-DD)', example: '2026-11-15' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'reviewDate must match YYYY-MM-DD format' })
  reviewDate?: string;

  @ApiProperty({ type: [CreatePipObjectiveDto], description: 'List of measurable objectives' })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => CreatePipObjectiveDto)
  objectives!: CreatePipObjectiveDto[];
}

export class UpdatePipDto {
  @ApiPropertyOptional({ description: 'Progress notes recorded during check-ins' })
  @IsOptional()
  @IsString()
  progressUpdates?: string;

  @ApiPropertyOptional({ description: 'Final assessment by manager' })
  @IsOptional()
  @IsString()
  finalAssessment?: string;

  @ApiPropertyOptional({ description: 'Comments recorded by the employee' })
  @IsOptional()
  @IsString()
  employeeComments?: string;

  @ApiPropertyOptional({ description: 'Extended or revised target completion date (YYYY-MM-DD)' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'targetCompletionDate must match YYYY-MM-DD format' })
  targetCompletionDate?: string;

  @ApiPropertyOptional({ description: 'Next review check-in date (YYYY-MM-DD)' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'reviewDate must match YYYY-MM-DD format' })
  reviewDate?: string;
}

export class UpdatePipObjectiveStatusDto {
  @ApiProperty({ enum: PipObjectiveStatus, example: PipObjectiveStatus.MET })
  @IsEnum(PipObjectiveStatus)
  @IsNotEmpty()
  status!: PipObjectiveStatus;
}

export class TransitionPipStatusDto {
  @ApiProperty({ enum: PipStatus, example: PipStatus.ACTIVE })
  @IsEnum(PipStatus)
  @IsNotEmpty()
  status!: PipStatus;

  @ApiPropertyOptional({ description: 'Reason for closure, extension, or non-achievement' })
  @IsOptional()
  @IsString()
  closureReason?: string;

  @ApiPropertyOptional({ description: 'Final evaluation assessment notes' })
  @IsOptional()
  @IsString()
  finalAssessment?: string;
}
