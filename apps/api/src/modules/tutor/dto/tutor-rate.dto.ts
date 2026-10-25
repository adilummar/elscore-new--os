import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';

export class SetTutorRateDto {
  @ApiProperty({ description: 'Hourly rate amount in AED' })
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  hourlyRate!: number;

  @ApiPropertyOptional({ description: 'Effective date (YYYY-MM-DD), defaults to today' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'effectiveDate must match YYYY-MM-DD format' })
  effectiveDate?: string;

  @ApiPropertyOptional({ description: 'Reason for rate change' })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class RequestTutorRateChangeDto {
  @ApiProperty({ description: 'Requested hourly rate in AED', example: 75 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  requestedHourlyRate!: number;

  @ApiProperty({ description: 'Effective date in YYYY-MM-DD format', example: '2026-11-01' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'effectiveDate must match YYYY-MM-DD format' })
  effectiveDate!: string;

  @ApiProperty({ description: 'Reason for tutor rate adjustment', example: 'Completion of probation & advanced certification' })
  @IsString()
  @IsNotEmpty()
  @MinLength(3, { message: 'reason must be at least 3 characters long' })
  reason!: string;
}

export class ReviewTutorRateChangeDto {
  @ApiProperty({ description: 'Review decision (APPROVED or REJECTED)', enum: ['APPROVED', 'REJECTED'] })
  @IsString()
  @IsNotEmpty()
  @IsIn(['APPROVED', 'REJECTED'])
  status!: 'APPROVED' | 'REJECTED';

  @ApiPropertyOptional({ description: 'Review note (mandatory if rejected)' })
  @IsOptional()
  @IsString()
  reviewNote?: string;
}
