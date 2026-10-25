import { ApiPropertyOptional } from '@nestjs/swagger';
import { OnboardingTaskCategory, OnboardingTaskStatus } from '@prisma/client';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MinLength,
} from 'class-validator';

export class UpdateTaskDto {
  @ApiPropertyOptional({ description: 'Task title or action item' })
  @IsOptional()
  @IsString()
  @MinLength(3, { message: 'title must be at least 3 characters long' })
  title?: string;

  @ApiPropertyOptional({ enum: OnboardingTaskCategory })
  @IsOptional()
  @IsEnum(OnboardingTaskCategory)
  category?: OnboardingTaskCategory;

  @ApiPropertyOptional({ description: 'User ID of assigned personnel' })
  @IsOptional()
  @IsUUID('4', { message: 'assignedToUserId must be a valid UUID v4' })
  assignedToUserId?: string;

  @ApiPropertyOptional({ description: 'Due date (YYYY-MM-DD)', example: '2026-11-20' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'dueDate must match YYYY-MM-DD format' })
  dueDate?: string;

  @ApiPropertyOptional({ enum: OnboardingTaskStatus, example: OnboardingTaskStatus.COMPLETED })
  @IsOptional()
  @IsEnum(OnboardingTaskStatus)
  status?: OnboardingTaskStatus;

  @ApiPropertyOptional({ description: 'Completion notes or progress details' })
  @IsOptional()
  @IsString()
  notes?: string;
}
