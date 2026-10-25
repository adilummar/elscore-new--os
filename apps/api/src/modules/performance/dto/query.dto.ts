import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import {
  GoalStatus,
  PerformanceCycleStatus,
  PerformanceReviewStatus,
  PerformanceReviewType,
  PipStatus,
} from '@prisma/client';

export class QueryPerformanceReviewsDto {
  @ApiPropertyOptional({ description: 'Filter by employee ID' })
  @IsOptional()
  @IsUUID('4')
  employeeId?: string;

  @ApiPropertyOptional({ description: 'Filter by reviewer employee ID' })
  @IsOptional()
  @IsUUID('4')
  reviewerId?: string;

  @ApiPropertyOptional({ description: 'Filter by cycle ID' })
  @IsOptional()
  @IsUUID('4')
  cycleId?: string;

  @ApiPropertyOptional({ description: 'Filter by department ID' })
  @IsOptional()
  @IsUUID('4')
  departmentId?: string;

  @ApiPropertyOptional({ description: 'Filter by period (e.g. 2026-10)' })
  @IsOptional()
  @IsString()
  period?: string;

  @ApiPropertyOptional({ enum: PerformanceReviewStatus })
  @IsOptional()
  @IsEnum(PerformanceReviewStatus)
  status?: PerformanceReviewStatus;

  @ApiPropertyOptional({ enum: PerformanceReviewType })
  @IsOptional()
  @IsEnum(PerformanceReviewType)
  reviewType?: PerformanceReviewType;

  @ApiPropertyOptional({ description: 'Page number', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Page limit', default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

export class QueryGoalsDto {
  @ApiPropertyOptional({ description: 'Filter by employee ID' })
  @IsOptional()
  @IsUUID('4')
  employeeId?: string;

  @ApiPropertyOptional({ description: 'Filter by cycle ID' })
  @IsOptional()
  @IsUUID('4')
  cycleId?: string;

  @ApiPropertyOptional({ description: 'Filter by period' })
  @IsOptional()
  @IsString()
  measurementPeriod?: string;

  @ApiPropertyOptional({ enum: GoalStatus })
  @IsOptional()
  @IsEnum(GoalStatus)
  status?: GoalStatus;
}

export class QueryPipsDto {
  @ApiPropertyOptional({ description: 'Filter by employee ID' })
  @IsOptional()
  @IsUUID('4')
  employeeId?: string;

  @ApiPropertyOptional({ description: 'Filter by manager employee ID' })
  @IsOptional()
  @IsUUID('4')
  managerId?: string;

  @ApiPropertyOptional({ enum: PipStatus })
  @IsOptional()
  @IsEnum(PipStatus)
  status?: PipStatus;
}

export class QueryCyclesDto {
  @ApiPropertyOptional({ enum: PerformanceCycleStatus })
  @IsOptional()
  @IsEnum(PerformanceCycleStatus)
  status?: PerformanceCycleStatus;

  @ApiPropertyOptional({ enum: PerformanceReviewType })
  @IsOptional()
  @IsEnum(PerformanceReviewType)
  reviewType?: PerformanceReviewType;
}
