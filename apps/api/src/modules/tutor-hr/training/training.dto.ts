import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

import { SESSION_NUMBERS, TRAINING_ATTENDANCE } from './training-rules';

export class CreateTrainingSessionDto {
  @ApiProperty({ enum: SESSION_NUMBERS }) @Type(() => Number) @IsInt() @IsIn([...SESSION_NUMBERS]) sessionNumber!: number;
  @ApiProperty() @IsDateString() scheduledAt!: string;
  /** Any Hiring staff member until the Tutor Coordinator role exists. */
  @ApiProperty() @IsUUID() conductorUserId!: string;
}

export class RescheduleTrainingSessionDto {
  @ApiProperty() @IsDateString() scheduledAt!: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() conductorUserId?: string;
  @ApiProperty() @IsString() @MinLength(3) @MaxLength(1000) reason!: string;
}

export class AddParticipantsDto {
  /** Candidate (tutor lead) ids; each must be Hired and eligible for this session number. */
  @ApiProperty({ type: [String] }) @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @IsUUID('all', { each: true }) tutorLeadIds!: string[];
}

export class RecordAttemptDto {
  @ApiProperty({ enum: TRAINING_ATTENDANCE }) @IsIn([...TRAINING_ATTENDANCE]) attendance!: (typeof TRAINING_ATTENDANCE)[number];
  @ApiProperty() @IsBoolean() taskCompleted!: boolean;
  /** Mandatory for Attended but Didn't Complete; optional reason for Not Attended. */
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) remarks?: string;
}

export class CorrectAttemptDto extends RecordAttemptDto {
  @ApiProperty() @IsString() @MinLength(3) @MaxLength(1000) reason!: string;
}

export class ListSessionsQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsDateString() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() to?: string;
  @ApiPropertyOptional({ enum: SESSION_NUMBERS }) @IsOptional() @Type(() => Number) @IsInt() @IsIn([...SESSION_NUMBERS]) sessionNumber?: number;
}

export class ListTraineesQueryDto {
  /** Only trainees who can be added to a session with this number. */
  @ApiPropertyOptional({ enum: SESSION_NUMBERS }) @IsOptional() @Type(() => Number) @IsInt() @IsIn([...SESSION_NUMBERS]) eligibleFor?: number;
  @ApiPropertyOptional({ enum: ['IN_PROGRESS', 'COMPLETED'] }) @IsOptional() @IsIn(['IN_PROGRESS', 'COMPLETED']) status?: 'IN_PROGRESS' | 'COMPLETED';
}
