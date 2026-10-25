import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OnboardingTaskCategory } from '@prisma/client';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MinLength,
} from 'class-validator';

export class CreateTaskDto {
  @ApiProperty({ description: 'Task title or action item', example: 'Provision Google Workspace & Slack Account' })
  @IsString()
  @IsNotEmpty()
  @MinLength(3, { message: 'title must be at least 3 characters long' })
  title!: string;

  @ApiProperty({ enum: OnboardingTaskCategory, example: OnboardingTaskCategory.IT_SETUP })
  @IsEnum(OnboardingTaskCategory)
  category!: OnboardingTaskCategory;

  @ApiPropertyOptional({ description: 'User ID of assigned personnel' })
  @IsOptional()
  @IsUUID('4', { message: 'assignedToUserId must be a valid UUID v4' })
  assignedToUserId?: string;

  @ApiPropertyOptional({ description: 'Due date (YYYY-MM-DD)', example: '2026-11-20' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'dueDate must match YYYY-MM-DD format' })
  dueDate?: string;

  @ApiPropertyOptional({ description: 'Task description or instructions' })
  @IsOptional()
  @IsString()
  notes?: string;
}
