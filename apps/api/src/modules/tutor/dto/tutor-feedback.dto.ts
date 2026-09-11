import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TutorFeedbackType } from '@prisma/client';
import { IsDateString, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreateTutorFeedbackDto {
  @ApiProperty({ enum: TutorFeedbackType, description: 'Type of feedback' })
  @IsEnum(TutorFeedbackType)
  feedbackType: TutorFeedbackType;

  @ApiProperty({ description: 'The date/period being evaluated (ISO 8601 string)' })
  @IsDateString()
  @IsNotEmpty()
  feedbackPeriodDate: string;
  @ApiPropertyOptional({ description: 'Rating from 1 to 5' })
  @IsInt()
  @Min(1)
  @Max(5)
  @IsOptional()
  rating?: number;

  @ApiProperty({ description: 'Feedback comments' })
  @IsString()
  @IsNotEmpty()
  comments: string;
}
