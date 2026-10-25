import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EmploymentType, WorkMode } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Min,
  MinLength,
} from 'class-validator';

export const SUPPORTED_OFFER_CURRENCIES = ['INR', 'AED', 'USD', 'SAR'] as const;
export type SupportedOfferCurrency = (typeof SUPPORTED_OFFER_CURRENCIES)[number];

export class CreateOfferDto {
  @ApiProperty({ description: 'Offered official designation or job title', example: 'Senior Academic Counselor' })
  @IsString()
  @IsNotEmpty()
  @MinLength(2, { message: 'roleTitle must be at least 2 characters long' })
  roleTitle!: string;

  @ApiPropertyOptional({ enum: EmploymentType, default: EmploymentType.FULL_TIME })
  @IsOptional()
  @IsEnum(EmploymentType)
  employmentType?: EmploymentType;

  @ApiPropertyOptional({ enum: WorkMode, default: WorkMode.ON_SITE })
  @IsOptional()
  @IsEnum(WorkMode)
  workMode?: WorkMode;

  @ApiPropertyOptional({ description: 'Work office location or territory', example: 'Bangalore Office' })
  @IsOptional()
  @IsString()
  location?: string;

  @ApiProperty({ description: 'Gross offered base salary compensation', example: 65000 })
  @Type(() => Number)
  @IsNumber()
  @Min(0, { message: 'offeredSalary cannot be negative' })
  offeredSalary!: number;

  @ApiPropertyOptional({
    description: 'Compensation currency code',
    enum: SUPPORTED_OFFER_CURRENCIES,
    default: 'INR',
  })
  @IsOptional()
  @IsString()
  @IsIn(SUPPORTED_OFFER_CURRENCIES, {
    message: `currency must be one of: ${SUPPORTED_OFFER_CURRENCIES.join(', ')}`,
  })
  currency?: string;

  @ApiPropertyOptional({ description: 'Frequency basis of salary: ANNUAL or MONTHLY', default: 'ANNUAL' })
  @IsOptional()
  @IsString()
  @IsIn(['ANNUAL', 'MONTHLY'], { message: 'salaryPeriod must be ANNUAL or MONTHLY' })
  salaryPeriod?: string;

  @ApiProperty({ description: 'Proposed start date (YYYY-MM-DD)', example: '2026-12-01' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'proposedStartDate must match YYYY-MM-DD format' })
  proposedStartDate!: string;

  @ApiProperty({ description: 'Offer expiry date (YYYY-MM-DD)', example: '2026-11-20' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'offerExpiryDate must match YYYY-MM-DD format' })
  offerExpiryDate!: string;

  @ApiPropertyOptional({ description: 'Offer terms, conditions, or allowances description' })
  @IsOptional()
  @IsString()
  notes?: string;
}
