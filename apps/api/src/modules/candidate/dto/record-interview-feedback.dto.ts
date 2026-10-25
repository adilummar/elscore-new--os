import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { InterviewRecommendation } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';

export class RecordInterviewFeedbackDto {
  @ApiPropertyOptional({ description: 'Evaluation rating score on a 1-5 scale', example: 4 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  @ApiProperty({ enum: InterviewRecommendation, description: 'Interviewer recommendation outcome' })
  @IsEnum(InterviewRecommendation)
  recommendation!: InterviewRecommendation;

  @ApiProperty({ description: 'Detailed feedback assessment and candidate remarks' })
  @IsString()
  @IsNotEmpty({ message: 'feedback cannot be empty' })
  feedback!: string;
}
