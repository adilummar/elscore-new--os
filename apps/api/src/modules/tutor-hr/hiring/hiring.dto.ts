import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

import { HIRING_DECISIONS, HIRING_STAGES, LEAD_STATUSES } from './hiring-rules';

const HM = /^([01]\d|2[0-3]):[0-5]\d$/;

const CALL_STATUSES = ['ATTENDED', 'BUSY_CALL_LATER', 'NOT_ATTENDED'] as const;

export class CheckDuplicateDto {
  @ApiProperty() @IsString() @MinLength(1) phone!: string;
  @ApiPropertyOptional({ default: '+91' }) @IsOptional() @IsString() countryCode?: string;
}

export class RegisterCandidateDto extends CheckDuplicateDto {
  @ApiProperty() @IsUUID() sourceId!: string;
  /** Lead date, YYYY-MM-DD. */
  @ApiProperty() @IsDateString() leadDate!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

export class AddEnquiryDto {
  @ApiProperty() @IsUUID() sourceId!: string;
  @ApiProperty() @IsDateString() enquiryDate!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

/** One weekly availability window, e.g. Monday 17:00-20:00 (0 = Sunday ... 6 = Saturday). */
export class AvailabilitySlotDto {
  @ApiProperty({ minimum: 0, maximum: 6 }) @Type(() => Number) @IsInt() @Min(0) @Max(6) dayOfWeek!: number;
  @ApiProperty({ example: '17:00' }) @IsString() @Matches(HM) startTime!: string;
  @ApiProperty({ example: '20:00' }) @IsString() @Matches(HM) endTime!: string;
}

export class UpdateCandidateDetailsDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() motherTongueId?: string;
  @ApiPropertyOptional() @IsOptional() @IsArray() @IsUUID('all', { each: true }) subjectIds?: string[];
  @ApiPropertyOptional() @IsOptional() @IsArray() @IsUUID('all', { each: true }) gradeIds?: string[];
  @ApiPropertyOptional() @IsOptional() @IsArray() @IsUUID('all', { each: true }) languageIds?: string[];
  @ApiPropertyOptional() @IsOptional() @IsArray() @IsUUID('all', { each: true }) curriculumIds?: string[];
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(80) onlineTeachingExperience?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(80) offlineTeachingExperience?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) expectedHourlyRate?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(30) additionalPhone?: string;
  /** Becomes the tutor's login ID at Ready for Assignment. */
  @ApiPropertyOptional() @IsOptional() @IsEmail() @MaxLength(254) email?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) remarks?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(5000) detailsDescription?: string;
  /** Candidate response date and time, entered manually by staff (ISO 8601). */
  @ApiPropertyOptional() @IsOptional() @IsDateString() detailsRespondedAt?: string;
  /** Available teaching time. Replaces the current slots; earlier slots are deactivated, not deleted. */
  @ApiPropertyOptional({ type: [AvailabilitySlotDto] })
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => AvailabilitySlotDto) availability?: AvailabilitySlotDto[];
}

export class SetCvReceivedDto {
  /** CV received date and time (ISO 8601), entered manually. */
  @ApiProperty() @IsDateString() cvReceivedAt!: string;
}

export class AdvanceStageDto {
  @ApiProperty({ enum: HIRING_STAGES }) @IsIn([...HIRING_STAGES]) to!: (typeof HIRING_STAGES)[number];
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) remarks?: string;
}

export class ChangeDecisionDto {
  @ApiProperty({ enum: HIRING_DECISIONS }) @IsIn([...HIRING_DECISIONS]) decision!: (typeof HIRING_DECISIONS)[number];
  /** Mandatory for Rejected and Not Interested; optional otherwise. */
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) remarks?: string;
}

export class SetLeadStatusDto {
  @ApiProperty({ enum: LEAD_STATUSES }) @IsIn([...LEAD_STATUSES]) status!: (typeof LEAD_STATUSES)[number];
  /** Mandatory for Rejected and Not Interested; optional when returning to Processing. */
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) remarks?: string;
}

export class LogCallDto {
  @ApiProperty({ enum: CALL_STATUSES }) @IsIn([...CALL_STATUSES]) status!: (typeof CALL_STATUSES)[number];
  /** Defaults to now. */
  @ApiPropertyOptional() @IsOptional() @IsDateString() calledAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) remarks?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() followUpAt?: string;
}

export class ListCandidatesQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() search?: string;
  @ApiPropertyOptional({ enum: HIRING_STAGES }) @IsOptional() @IsIn([...HIRING_STAGES]) stage?: string;
  @ApiPropertyOptional({ enum: HIRING_DECISIONS }) @IsOptional() @IsIn([...HIRING_DECISIONS]) decision?: string;
  @ApiPropertyOptional({ enum: LEAD_STATUSES }) @IsOptional() @IsIn([...LEAD_STATUSES]) leadStatus?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() sourceId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() managerId?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() to?: string;
  /** Only candidates I created, am assigned, or am a demo participant of. */
  @ApiPropertyOptional() @IsOptional() @Transform(({ value }) => value === true || value === 'true' || value === '1') mine?: boolean;
  @ApiPropertyOptional({ enum: ['createdAt', 'updatedAt', 'businessId'] })
  @IsOptional() @IsIn(['createdAt', 'updatedAt', 'businessId']) sortBy?: 'createdAt' | 'updatedAt' | 'businessId';
  @ApiPropertyOptional({ enum: ['asc', 'desc'] }) @IsOptional() @IsIn(['asc', 'desc']) sortDir?: 'asc' | 'desc';
  @ApiPropertyOptional({ default: 1 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @ApiPropertyOptional({ default: 25 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize?: number;
}

export class CreateSourceDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(100) name!: string;
}

export class UpdateSourceDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(1) @MaxLength(100) name?: string;
  @ApiPropertyOptional() @IsOptional() isActive?: boolean;
}
