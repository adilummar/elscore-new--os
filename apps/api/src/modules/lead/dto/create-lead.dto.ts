import { LeadSource } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsArray, IsDate, IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength, ValidateNested } from 'class-validator';

export class NestedRequirementDto {
  @IsUUID()
  @IsNotEmpty()
  subjectId!: string;

  @IsUUID()
  @IsNotEmpty()
  curriculumId!: string;

  @IsUUID()
  @IsNotEmpty()
  gradeId!: string;

  @IsString()
  @IsOptional()
  syllabus?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class NestedStudentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName!: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  lastName?: string;

  @Type(() => Date)
  @IsDate()
  @IsOptional()
  dateOfBirth?: Date;

  @IsString()
  @IsOptional()
  gender?: string;

  @IsString()
  @IsOptional()
  schoolName?: string;

  @IsString()
  @IsOptional()
  currentGrade?: string;

  @IsString()
  @IsOptional()
  cityLocation?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => NestedRequirementDto)
  requirements?: NestedRequirementDto[];
}

export class CreateLeadDto {
  @IsString()
  @IsOptional()
  @MaxLength(100)
  firstName?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  lastName?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  primaryPhone!: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  altPhone1?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  altPhone2?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  whatsappNumber?: string;

  @IsEnum(LeadSource)
  @IsNotEmpty()
  source!: LeadSource;

  // Manual Marketing / Attribution support
  @IsString()
  @IsOptional()
  @MaxLength(100)
  channel?: string;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  campaign?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  externalCampaignId?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  externalLeadId?: string;

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => NestedStudentDto)
  students?: NestedStudentDto[];
}
