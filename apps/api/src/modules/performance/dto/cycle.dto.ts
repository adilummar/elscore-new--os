import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID, Matches } from 'class-validator';
import { PerformanceCycleStatus, PerformanceReviewType } from '@prisma/client';

export class CreatePerformanceCycleDto {
  @ApiProperty({ description: 'Cycle title (e.g. October 2026 Monthly Review)', example: 'October 2026 Monthly Review' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional({ enum: PerformanceReviewType, default: PerformanceReviewType.MONTHLY })
  @IsOptional()
  @IsEnum(PerformanceReviewType)
  reviewType?: PerformanceReviewType;

  @ApiProperty({ description: 'Start date of the review period (YYYY-MM-DD)', example: '2026-10-01' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'startDate must match YYYY-MM-DD format' })
  startDate!: string;

  @ApiProperty({ description: 'End date of the review period (YYYY-MM-DD)', example: '2026-10-31' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'endDate must match YYYY-MM-DD format' })
  endDate!: string;

  @ApiProperty({ description: 'Due date for completing reviews (YYYY-MM-DD)', example: '2026-11-07' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'dueDate must match YYYY-MM-DD format' })
  dueDate!: string;

  @ApiPropertyOptional({ description: 'Optional department ID if scope is limited to a department' })
  @IsOptional()
  @IsUUID('4')
  departmentId?: string;
}

export class UpdatePerformanceCycleDto {
  @ApiPropertyOptional({ description: 'Cycle title' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @ApiPropertyOptional({ enum: PerformanceCycleStatus })
  @IsOptional()
  @IsEnum(PerformanceCycleStatus)
  status?: PerformanceCycleStatus;

  @ApiPropertyOptional({ description: 'Start date (YYYY-MM-DD)' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'startDate must match YYYY-MM-DD format' })
  startDate?: string;

  @ApiPropertyOptional({ description: 'End date (YYYY-MM-DD)' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'endDate must match YYYY-MM-DD format' })
  endDate?: string;

  @ApiPropertyOptional({ description: 'Due date (YYYY-MM-DD)' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'dueDate must match YYYY-MM-DD format' })
  dueDate?: string;
}
