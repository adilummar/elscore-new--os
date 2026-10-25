import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { InterviewMode, InterviewType } from '@prisma/client';
import { IsDateString, IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ScheduleInterviewDto {
  @ApiProperty({ enum: InterviewType, default: InterviewType.TECHNICAL })
  @IsEnum(InterviewType)
  interviewType!: InterviewType;

  @ApiProperty({ enum: InterviewMode, default: InterviewMode.ONLINE })
  @IsEnum(InterviewMode)
  interviewMode!: InterviewMode;

  @ApiProperty({ description: 'Scheduled interview date and time (ISO string)', example: '2026-11-05T10:00:00Z' })
  @IsDateString({}, { message: 'scheduledAt must be a valid ISO-8601 date-time string' })
  @IsNotEmpty()
  scheduledAt!: string;

  @ApiPropertyOptional({ description: 'Interviewer internal system User ID' })
  @IsOptional()
  @IsString()
  interviewerUserId?: string;

  @ApiPropertyOptional({ description: 'Interviewer display or external name' })
  @IsOptional()
  @IsString()
  interviewerName?: string;

  @ApiPropertyOptional({ description: 'Meeting link (e.g. Google Meet) or physical room' })
  @IsOptional()
  @IsString()
  location?: string;
}
