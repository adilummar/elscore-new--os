import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

import { HIRING_DECISIONS, HIRING_STAGES } from './hiring-rules';

const HM = /^([01]\d|2[0-3]):[0-5]\d$/;

export class BookDemoDto {
  @ApiProperty() @IsDateString() scheduledAt!: string;
  @ApiProperty() @IsUUID() assignedToUserId!: string;
}

export class RescheduleDemoDto {
  @ApiProperty() @IsDateString() scheduledAt!: string;
  @ApiProperty() @IsString() @MinLength(3) @MaxLength(1000) reason!: string;
}

export class ReassignDemoDto {
  @ApiProperty() @IsUUID() toUserId!: string;
  @ApiProperty() @IsString() @MinLength(3) @MaxLength(1000) reason!: string;
}

export class DemoAttendanceDto {
  @ApiProperty({ enum: ['ATTENDED', 'NOT_ATTENDED'] }) @IsIn(['ATTENDED', 'NOT_ATTENDED']) status!: 'ATTENDED' | 'NOT_ATTENDED';
  /** Staff member who actually conducted the demo. Defaults to the caller. */
  @ApiPropertyOptional() @IsOptional() @IsUUID() attendedByUserId?: string;
  /** Actual completion time; defaults to now. Starts the evaluation SLA. */
  @ApiPropertyOptional() @IsOptional() @IsDateString() completedAt?: string;
}

export class SubmitEvaluationDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(5000) teachingMethods!: string;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(5000) technicalSkills!: string;
  @ApiProperty({ minimum: 1, maximum: 5 }) @IsInt() @Min(1) @Max(5) englishRating!: number;
  @ApiPropertyOptional() @IsOptional() @IsUUID() salarySlabId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) remarks?: string;
}

export class WorkloadQueryDto {
  /** Inclusive local range, YYYY-MM-DD (day / week / month views are ranges). */
  @ApiProperty() @IsDateString() from!: string;
  @ApiProperty() @IsDateString() to!: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() assigneeId?: string;
  @ApiPropertyOptional() @IsOptional() @IsIn(['BOOKED', 'ATTENDED', 'RESCHEDULE', 'NOT_ATTENDED']) status?: string;
}

export class SetScheduleDto {
  @ApiProperty() @IsString() @Matches(HM) startTime!: string;
  @ApiProperty() @IsString() @Matches(HM) endTime!: string;
  @ApiProperty({ type: [Number] }) @IsArray() @ArrayMinSize(1) @Type(() => Number) @IsInt({ each: true }) @Min(0, { each: true }) @Max(6, { each: true }) workingDays!: number[];
  @ApiProperty() @IsString() @MinLength(3) timezone!: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() effectiveFrom?: string;
}

export class ReportQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsDateString() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() to?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() sourceId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() managerId?: string;
  @ApiPropertyOptional({ enum: HIRING_STAGES }) @IsOptional() @IsIn([...HIRING_STAGES]) stage?: string;
  @ApiPropertyOptional({ enum: HIRING_DECISIONS }) @IsOptional() @IsIn([...HIRING_DECISIONS]) decision?: string;
}

export class CreateAdSpendDto {
  @ApiProperty() @IsUUID() sourceId!: string;
  @ApiProperty() @IsDateString() periodStart!: string;
  @ApiProperty() @IsDateString() periodEnd!: string;
  @ApiProperty() @Type(() => Number) @Min(0) amount!: number;
  @ApiProperty() @IsString() @Matches(/^[A-Z]{3}$/) currency!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) notes?: string;
}
