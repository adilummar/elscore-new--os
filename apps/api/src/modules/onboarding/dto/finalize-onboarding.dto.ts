import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  ValidateIf,
} from 'class-validator';

export class FinalizeOnboardingDto {
  @ApiProperty({ description: 'Confirmed actual joining date (YYYY-MM-DD)', example: '2026-11-20' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'confirmedJoiningDate must match YYYY-MM-DD format' })
  confirmedJoiningDate!: string;

  @ApiPropertyOptional({ description: 'Department override (defaults to vacancy department)' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' && value.trim() === '' ? undefined : value))
  @ValidateIf((o, v) => v !== '' && v !== null && v !== undefined)
  @IsUUID('4', { message: 'departmentId must be a valid UUID v4' })
  departmentId?: string;

  @ApiPropertyOptional({
    description: 'Role override. When omitted, the vacancy role is used. Finalization fails if neither is set.',
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' && value.trim() === '' ? undefined : value))
  @ValidateIf((o, v) => v !== '' && v !== null && v !== undefined)
  @IsUUID('4', { message: 'roleId must be a valid UUID v4' })
  roleId?: string;

  @ApiPropertyOptional({ description: 'Official Job Title override (defaults to offer roleTitle)' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' && value.trim() === '' ? undefined : typeof value === 'string' ? value.trim() : value))
  @IsString()
  jobTitle?: string;

  @ApiPropertyOptional({ description: 'Personal email address for communications', example: 'candidate.personal@example.com' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' && value.trim() === '' ? undefined : typeof value === 'string' ? value.trim() : value))
  @ValidateIf((o, v) => v !== '' && v !== null && v !== undefined)
  @IsEmail({}, { message: 'personalEmail must be a valid email address' })
  personalEmail?: string;

  @ApiPropertyOptional({ description: 'Personal mobile/phone number', example: '+919876543210' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' && value.trim() === '' ? undefined : typeof value === 'string' ? value.trim() : value))
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ description: 'Date of birth (YYYY-MM-DD)', example: '1995-06-15' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' && value.trim() === '' ? undefined : typeof value === 'string' ? value.trim() : value))
  @ValidateIf((o, v) => v !== '' && v !== null && v !== undefined)
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'dateOfBirth must match YYYY-MM-DD format' })
  dateOfBirth?: string;

  @ApiPropertyOptional({ description: 'Gender identification', example: 'MALE' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' && value.trim() === '' ? undefined : typeof value === 'string' ? value.trim() : value))
  @IsString()
  gender?: string;

  @ApiPropertyOptional({ description: 'Residential street address' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' && value.trim() === '' ? undefined : typeof value === 'string' ? value.trim() : value))
  @IsString()
  address?: string;

  @ApiPropertyOptional({ description: 'Emergency contact full name', example: 'Jane Doe' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' && value.trim() === '' ? undefined : typeof value === 'string' ? value.trim() : value))
  @IsString()
  emergencyContactName?: string;

  @ApiPropertyOptional({ description: 'Emergency contact phone number', example: '+919876543211' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' && value.trim() === '' ? undefined : typeof value === 'string' ? value.trim() : value))
  @IsString()
  emergencyContactPhone?: string;

  @ApiPropertyOptional({ description: 'Relationship with emergency contact', example: 'Spouse' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' && value.trim() === '' ? undefined : typeof value === 'string' ? value.trim() : value))
  @IsString()
  emergencyContactRelation?: string;

  @ApiPropertyOptional({ description: 'Finalization remarks or notes' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' && value.trim() === '' ? undefined : typeof value === 'string' ? value.trim() : value))
  @IsString()
  notes?: string;
}
