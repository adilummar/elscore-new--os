import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EmploymentType, VacancyPriority, WorkMode } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  Min,
  MinLength,
} from 'class-validator';

export const SUPPORTED_CURRENCIES = ['INR', 'AED', 'USD', 'SAR'] as const;
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

export class CreateVacancyDto {
  @ApiProperty({ description: 'Job title / position name', example: 'Senior Academic Counselor' })
  @IsString()
  @IsNotEmpty()
  @MinLength(2, { message: 'title must be at least 2 characters long' })
  title!: string;

  @ApiProperty({ description: 'Target department ID' })
  @IsString()
  @IsNotEmpty()
  departmentId!: string;

  @ApiPropertyOptional({ description: 'Target system/business role ID' })
  @IsOptional()
  @IsString()
  roleId?: string;

  @ApiPropertyOptional({ enum: EmploymentType, default: EmploymentType.FULL_TIME })
  @IsOptional()
  @IsEnum(EmploymentType)
  employmentType?: EmploymentType;

  @ApiPropertyOptional({ enum: WorkMode, default: WorkMode.ON_SITE })
  @IsOptional()
  @IsEnum(WorkMode)
  workMode?: WorkMode;

  @ApiPropertyOptional({ description: 'Work office location or territory', example: 'Bangalore Office' })
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional({ description: 'Number of open positions for this role', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  targetHeadcount?: number;

  @ApiPropertyOptional({ enum: VacancyPriority, default: VacancyPriority.MEDIUM })
  @IsOptional()
  @IsEnum(VacancyPriority)
  priority?: VacancyPriority;

  @ApiProperty({ description: 'Business justification for workforce addition', example: 'Expansion of GCC sales division' })
  @IsString()
  @IsNotEmpty()
  @MinLength(5, { message: 'justification must be at least 5 characters long' })
  justification!: string;

  @ApiPropertyOptional({ description: 'Target start date (YYYY-MM-DD)', example: '2026-12-01' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'targetStartDate must match YYYY-MM-DD format' })
  targetStartDate?: string;

  @ApiPropertyOptional({ description: 'Target closure date (YYYY-MM-DD)', example: '2026-11-20' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'targetClosureDate must match YYYY-MM-DD format' })
  targetClosureDate?: string;

  @ApiPropertyOptional({ description: 'Minimum annual/monthly budgeted compensation', example: 50000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  budgetMin?: number;

  @ApiPropertyOptional({ description: 'Maximum annual/monthly budgeted compensation', example: 75000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  budgetMax?: number;

  @ApiPropertyOptional({
    description: 'Currency code',
    enum: SUPPORTED_CURRENCIES,
    default: 'INR',
    example: 'INR',
  })
  @IsOptional()
  @IsString()
  @IsIn(SUPPORTED_CURRENCIES, {
    message: `currency must be one of: ${SUPPORTED_CURRENCIES.join(', ')}`,
  })
  currency?: string;

  @ApiPropertyOptional({ description: 'Additional context or requirements' })
  @IsOptional()
  @IsString()
  notes?: string;
}
