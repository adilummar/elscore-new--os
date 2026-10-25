import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class CreateOnboardingCaseDto {
  @ApiProperty({ description: 'ID of the JobApplication with an ACCEPTED offer' })
  @IsUUID('4', { message: 'applicationId must be a valid UUID v4' })
  @IsNotEmpty()
  applicationId!: string;

  @ApiProperty({ description: 'Target joining date (YYYY-MM-DD)', example: '2026-11-15' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'targetJoiningDate must match YYYY-MM-DD format' })
  targetJoiningDate!: string;

  @ApiPropertyOptional({ description: 'Probation duration in months (1-24)', default: 3, example: 3 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1, { message: 'probationDurationMonths must be at least 1 month' })
  @Max(24, { message: 'probationDurationMonths cannot exceed 24 months' })
  probationDurationMonths?: number;

  @ApiPropertyOptional({ description: 'Initial onboarding notes or special arrangements' })
  @IsOptional()
  @IsString()
  notes?: string;
}
