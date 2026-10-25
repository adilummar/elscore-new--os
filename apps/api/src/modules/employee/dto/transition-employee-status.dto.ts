import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EmploymentStatus } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class TransitionEmployeeStatusDto {
  @ApiProperty({
    enum: EmploymentStatus,
    description: 'Target employment lifecycle status',
  })
  @IsEnum(EmploymentStatus)
  @IsNotEmpty()
  status: EmploymentStatus;

  @ApiProperty({
    description: 'Effective date of the transition in YYYY-MM-DD format',
  })
  @IsString()
  @IsNotEmpty()
  effectiveDate: string;

  @ApiProperty({
    description: 'Mandatory reason explaining the status transition',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(500)
  reason: string;

  @ApiPropertyOptional({
    description: 'Optional confidential internal transition notes or memo',
  })
  @IsString()
  @IsOptional()
  @MaxLength(2000)
  notes?: string;

  @ApiPropertyOptional({
    description: 'Probation end date in YYYY-MM-DD format',
  })
  @IsString()
  @IsOptional()
  probationEndDate?: string;

  @ApiPropertyOptional({
    description: 'Confirmation date in YYYY-MM-DD format (if confirming probation)',
  })
  @IsString()
  @IsOptional()
  confirmationDate?: string;

  @ApiPropertyOptional({
    description: 'Resignation date in YYYY-MM-DD format (if entering notice period)',
  })
  @IsString()
  @IsOptional()
  resignationDate?: string;

  @ApiPropertyOptional({
    description: 'Last working date in YYYY-MM-DD format (if entering notice period or exiting)',
  })
  @IsString()
  @IsOptional()
  lastWorkingDate?: string;

  @ApiPropertyOptional({
    description: 'Notice period duration in days',
  })
  @IsInt()
  @Min(0)
  @IsOptional()
  noticePeriodDays?: number;

  @ApiPropertyOptional({
    description: 'Explicitly restrict/suspend user account access. If true, user status is set to SUSPENDED and active sessions revoked.',
  })
  @IsBoolean()
  @IsOptional()
  restrictAccess?: boolean;
}
