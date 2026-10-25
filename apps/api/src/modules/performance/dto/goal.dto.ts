import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { GoalCategory, GoalMeasurementMethod, GoalStatus } from '@prisma/client';

export class CreateEmployeeGoalDto {
  @ApiProperty({ description: 'Target employee ID' })
  @IsUUID('4', { message: 'employeeId must be a valid UUID v4' })
  @IsNotEmpty()
  employeeId!: string;

  @ApiPropertyOptional({ description: 'Optional cycle ID' })
  @IsOptional()
  @IsUUID('4')
  cycleId?: string;

  @ApiPropertyOptional({ description: 'Optional designated reviewer / manager employee ID' })
  @IsOptional()
  @IsUUID('4')
  reviewerId?: string;

  @ApiProperty({ description: 'Goal title or expected outcome', example: 'Achieve monthly lead qualification target' })
  @IsString()
  @IsNotEmpty()
  title!: string;

  @ApiPropertyOptional({ description: 'Detailed description or context' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: GoalCategory, default: GoalCategory.GENERAL })
  @IsOptional()
  @IsEnum(GoalCategory)
  category?: GoalCategory;

  @ApiPropertyOptional({ enum: GoalMeasurementMethod, default: GoalMeasurementMethod.NUMERICAL })
  @IsOptional()
  @IsEnum(GoalMeasurementMethod)
  measurementMethod?: GoalMeasurementMethod;

  @ApiProperty({ description: 'Target value or success threshold (e.g. 20 leads, 95%, Complete SOP)', example: '20 Qualified Leads' })
  @IsString()
  @IsNotEmpty()
  target!: string;

  @ApiProperty({ description: 'Measurement period (e.g. 2026-10 or Q4 2026)', example: '2026-10' })
  @IsString()
  @IsNotEmpty()
  measurementPeriod!: string;

  @ApiPropertyOptional({ description: 'Weight percentage (0-100)', default: 0, example: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  weight?: number;

  @ApiPropertyOptional({ description: 'Evidence link or reference description' })
  @IsOptional()
  @IsString()
  evidence?: string;
}

export class UpdateEmployeeGoalDto {
  @ApiPropertyOptional({ description: 'Goal title' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  title?: string;

  @ApiPropertyOptional({ description: 'Detailed description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: GoalCategory })
  @IsOptional()
  @IsEnum(GoalCategory)
  category?: GoalCategory;

  @ApiPropertyOptional({ enum: GoalMeasurementMethod })
  @IsOptional()
  @IsEnum(GoalMeasurementMethod)
  measurementMethod?: GoalMeasurementMethod;

  @ApiPropertyOptional({ description: 'Target value' })
  @IsOptional()
  @IsString()
  target?: string;

  @ApiPropertyOptional({ description: 'Actual recorded result' })
  @IsOptional()
  @IsString()
  actualResult?: string;

  @ApiPropertyOptional({ description: 'Weight percentage (0-100)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  weight?: number;

  @ApiPropertyOptional({ description: 'Evidence link or notes' })
  @IsOptional()
  @IsString()
  evidence?: string;

  @ApiPropertyOptional({ enum: GoalStatus })
  @IsOptional()
  @IsEnum(GoalStatus)
  status?: GoalStatus;
}
