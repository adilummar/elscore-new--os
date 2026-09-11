import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TutorRecruitmentStageCode, TutorRejectionReason } from '@prisma/client';
import { IsEmail, IsEnum, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateRecruitmentDto {
  @ApiProperty({ description: 'Candidate first name' })
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @ApiProperty({ description: 'Candidate last name' })
  @IsString()
  @IsNotEmpty()
  lastName: string;

  @ApiProperty({ description: 'Candidate phone' })
  @IsString()
  @IsNotEmpty()
  phone: string;

  @ApiPropertyOptional({ description: 'Candidate email' })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiPropertyOptional({ description: 'Years of experience' })
  @IsInt()
  @IsOptional()
  yearsOfExperience?: number;

  @ApiPropertyOptional({ description: 'Expected hourly rate' })
  @IsNumber()
  @IsOptional()
  expectedHourlyRate?: number;

  @ApiPropertyOptional({ description: 'Subjects summary text' })
  @IsString()
  @IsOptional()
  subjectsText?: string;

  @ApiPropertyOptional({ description: 'Grades summary text' })
  @IsString()
  @IsOptional()
  gradesText?: string;

  @ApiPropertyOptional({ description: 'Curriculum summary text' })
  @IsString()
  @IsOptional()
  curriculumText?: string;

  @ApiPropertyOptional({ description: 'Availability summary text' })
  @IsString()
  @IsOptional()
  availabilityText?: string;

  @ApiPropertyOptional({ description: 'Internal remarks' })
  @IsString()
  @IsOptional()
  remarks?: string;
}

export class AdvanceRecruitmentStageDto {
  @ApiProperty({ enum: TutorRecruitmentStageCode, description: 'Next stage' })
  @IsEnum(TutorRecruitmentStageCode)
  stage: TutorRecruitmentStageCode;

  @ApiPropertyOptional({ description: 'Notes for the stage transition' })
  @IsString()
  @IsOptional()
  @MaxLength(1000)
  notes?: string;
}

export class RejectRecruitmentDto {
  @ApiProperty({ enum: TutorRejectionReason, description: 'Reason for rejection' })
  @IsEnum(TutorRejectionReason)
  reason: TutorRejectionReason;
}
