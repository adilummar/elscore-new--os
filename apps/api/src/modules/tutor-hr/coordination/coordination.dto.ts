import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsDateString, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength, ValidateIf,
} from 'class-validator';

import { OBSERVATION_STATUSES } from './coordination-rules';

export class AssignCoordinatorDto {
  @ApiProperty({ type: [String] }) @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @IsUUID('all', { each: true }) tutorProfileIds!: string[];
  /** null unassigns (reason required). */
  @ApiProperty({ nullable: true }) @ValidateIf((_o, v) => v !== null) @IsUUID() coordinatorUserId!: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) reason?: string;
}

export class ObservationDto {
  /** Observed class date and time (ISO 8601). */
  @ApiProperty() @IsDateString() observedAt!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(5000) positiveFeedback?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(5000) negativeFeedback?: string;
}

export class HideObservationDto {
  @ApiProperty() @IsString() @MinLength(3) @MaxLength(1000) reason!: string;
}

export class CoordinationQueryDto {
  /** Head only. "none" lists tutors without a coordinator. */
  @ApiPropertyOptional() @IsOptional() @IsString() coordinatorId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) search?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() subjectId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() gradeId?: string;
  @ApiPropertyOptional({ enum: OBSERVATION_STATUSES }) @IsOptional() @IsIn([...OBSERVATION_STATUSES]) observationStatus?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() joinedFrom?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() joinedTo?: string;
}
