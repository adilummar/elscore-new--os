import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class UpdateOnboardingCaseDto {
  @ApiPropertyOptional({ description: 'Target joining date (YYYY-MM-DD)', example: '2026-11-20' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'targetJoiningDate must match YYYY-MM-DD format' })
  targetJoiningDate?: string;

  @ApiPropertyOptional({ description: 'Confirmed joining date (YYYY-MM-DD)', example: '2026-11-25' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'confirmedJoiningDate must match YYYY-MM-DD format' })
  confirmedJoiningDate?: string;

  @ApiPropertyOptional({ description: 'Probation duration in months (1-24)', example: 6 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1, { message: 'probationDurationMonths must be at least 1 month' })
  @Max(24, { message: 'probationDurationMonths cannot exceed 24 months' })
  probationDurationMonths?: number;

  @ApiPropertyOptional({ description: 'Onboarding case notes or updates' })
  @IsOptional()
  @IsString()
  notes?: string;
}
