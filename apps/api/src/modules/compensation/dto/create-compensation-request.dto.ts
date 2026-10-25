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

export class CreateCompensationRequestDto {
  @ApiProperty({ description: 'Requested monthly base salary in INR', example: 50000 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  requestedBaseSalary!: number;

  @ApiProperty({ description: 'Effective date in YYYY-MM-DD format (Asia/Kolkata)', example: '2026-11-01' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'effectiveDate must match YYYY-MM-DD format' })
  effectiveDate!: string;

  @ApiProperty({ description: 'Reason for salary adjustment', example: 'Annual performance revision' })
  @IsString()
  @IsNotEmpty()
  @MinLength(3, { message: 'reason must be at least 3 characters long' })
  reason!: string;

  @ApiPropertyOptional({ description: 'Payment frequency', default: 'MONTHLY', example: 'MONTHLY' })
  @IsOptional()
  @IsString()
  @IsIn(['MONTHLY'])
  paymentFrequency?: string;

  @ApiPropertyOptional({ description: 'Bank Name for payroll' })
  @IsOptional()
  @IsString()
  bankName?: string;

  @ApiPropertyOptional({ description: 'Bank Account Number' })
  @IsOptional()
  @IsString()
  bankAccountNumber?: string;

  @ApiPropertyOptional({ description: 'Bank IFSC Code' })
  @IsOptional()
  @IsString()
  bankIfsc?: string;

  @ApiPropertyOptional({ description: 'PAN Card Number' })
  @IsOptional()
  @IsString()
  panNumber?: string;
}
