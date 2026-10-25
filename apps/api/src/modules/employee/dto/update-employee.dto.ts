import { ApiPropertyOptional } from '@nestjs/swagger';
import { EmploymentType } from '@prisma/client';
import {
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateEmployeeDto {
  @ApiPropertyOptional({ description: 'First name' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  firstName?: string;

  @ApiPropertyOptional({ description: 'Last name' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  lastName?: string;

  @ApiPropertyOptional({ description: 'Phone number' })
  @IsString()
  @IsOptional()
  @MaxLength(20)
  phone?: string;

  @ApiPropertyOptional({ description: 'Department ID' })
  @IsUUID()
  @IsOptional()
  departmentId?: string;

  @ApiPropertyOptional({ description: 'Personal email address' })
  @IsEmail()
  @IsOptional()
  @MaxLength(150)
  personalEmail?: string;

  @ApiPropertyOptional({ description: 'Date of birth (YYYY-MM-DD)' })
  @IsString()
  @IsOptional()
  dateOfBirth?: string;

  @ApiPropertyOptional({ description: 'Gender' })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  gender?: string;

  @ApiPropertyOptional({ description: 'Residential address' })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  address?: string;

  @ApiPropertyOptional({ description: 'Emergency contact full name' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  emergencyContactName?: string;

  @ApiPropertyOptional({ description: 'Emergency contact phone number' })
  @IsString()
  @IsOptional()
  @MaxLength(20)
  emergencyContactPhone?: string;

  @ApiPropertyOptional({ description: 'Emergency contact relationship' })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  emergencyContactRelation?: string;

  @ApiPropertyOptional({ description: 'Job title / Designation' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  jobTitle?: string;

  @ApiPropertyOptional({ enum: EmploymentType, description: 'Employment Type' })
  @IsEnum(EmploymentType)
  @IsOptional()
  employmentType?: EmploymentType;

  @ApiPropertyOptional({ description: 'Reporting manager employee UUID' })
  @IsUUID()
  @IsOptional()
  reportingManagerId?: string | null;

  @ApiPropertyOptional({ description: 'Notice period in days' })
  @IsInt()
  @Min(0)
  @IsOptional()
  noticePeriodDays?: number;
}
