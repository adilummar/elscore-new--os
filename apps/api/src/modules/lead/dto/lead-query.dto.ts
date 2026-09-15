import { LeadSource, LeadStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsString, Max, Min } from 'class-validator';

export class LeadQueryDto {
  @IsString()
  @IsOptional()
  search?: string;

  @IsEnum(LeadStatus)
  @IsOptional()
  status?: LeadStatus;

  @IsEnum(LeadSource)
  @IsOptional()
  source?: LeadSource;

  @IsString()
  @IsOptional()
  assignedToUserId?: string;

  @IsBoolean()
  @IsOptional()
  @Type(() => Boolean)
  isArchived?: boolean;

  @IsBoolean()
  @IsOptional()
  @Type(() => Boolean)
  isReferral?: boolean;

  @IsBoolean()
  @IsOptional()
  @Type(() => Boolean)
  hasMarketingAttribution?: boolean;

  @Type(() => Number)
  @IsOptional()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsString()
  @IsOptional()
  cursor?: string;
}
