import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TutorLeadStageCode } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreateTutorLeadDto {
  @ApiProperty()
  @IsString()
  firstName: string;

  @ApiProperty()
  @IsString()
  lastName: string;

  @ApiProperty()
  @IsString()
  phone: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  motherTongueId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  totalTeachingExperience?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  offlineTeachingExperience?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  expectedHourlyRate?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remarks?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  subjectIds?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  gradeIds?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  languageIds?: string[];
}

export class UpdateTutorLeadDto extends CreateTutorLeadDto {}

export class ChangeTutorLeadStageDto {
  @ApiProperty({ enum: TutorLeadStageCode })
  @IsEnum(TutorLeadStageCode)
  stage: TutorLeadStageCode;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remarks?: string;
}

export class RecordTutorLeadCallDto {
  @ApiProperty()
  @IsString()
  remark: string;
}

export class RecordTutorLeadDemoDto {
  @ApiProperty()
  @IsString()
  remarks?: string;

  @ApiPropertyOptional()
  @IsOptional()
  isLiveDemo?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  demoDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  startTime?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  endTime?: string;
}

export class TutorLeadAvailabilitySlotDto {
  @ApiProperty()
  @IsInt()
  @Min(0)
  dayOfWeek: number;

  @ApiProperty()
  @IsString()
  startTime: string; // ISO or "HH:mm" - will parse

  @ApiProperty()
  @IsString()
  endTime: string; // ISO or "HH:mm"
}

export class UpdateTutorLeadAvailabilityDto {
  @ApiProperty({ type: [TutorLeadAvailabilitySlotDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TutorLeadAvailabilitySlotDto)
  slots: TutorLeadAvailabilitySlotDto[];
}
