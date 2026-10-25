import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProbationReviewOutcome } from '@prisma/client';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class CreateProbationReviewDto {
  @ApiProperty({ description: 'Review evaluation date (YYYY-MM-DD)', example: '2027-02-15' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'reviewDate must match YYYY-MM-DD format' })
  reviewDate!: string;

  @ApiProperty({
    enum: ProbationReviewOutcome,
    example: ProbationReviewOutcome.CONFIRMED,
    description: 'Outcome of probation evaluation: CONFIRMED, EXTENDED, or TERMINATED',
  })
  @IsEnum(ProbationReviewOutcome)
  outcome!: ProbationReviewOutcome;

  @ApiPropertyOptional({
    description: 'New proposed probation end date (YYYY-MM-DD, mandatory if outcome is EXTENDED)',
    example: '2027-05-15',
  })
  @ValidateIf((o) => o.outcome === ProbationReviewOutcome.EXTENDED)
  @IsNotEmpty({ message: 'extendedEndDate is mandatory when outcome is EXTENDED' })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'extendedEndDate must match YYYY-MM-DD format' })
  extendedEndDate?: string;

  @ApiProperty({
    description: 'Performance review evaluation notes and feedback',
    example: 'Employee demonstrated exemplary competence and met all department KPIs.',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(5, { message: 'notes must be at least 5 characters long' })
  notes!: string;
}
