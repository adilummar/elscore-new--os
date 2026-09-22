import { LeadDistributionMethod } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsDate, IsEnum, IsOptional, IsString, Max, Min } from 'class-validator';

export class LeadDistributionHistoryQueryDto {
  @Type(() => Date)
  @IsDate()
  @IsOptional()
  date?: Date;

  @Type(() => Date)
  @IsDate()
  @IsOptional()
  from?: Date;

  @Type(() => Date)
  @IsDate()
  @IsOptional()
  to?: Date;

  @IsEnum(LeadDistributionMethod)
  @IsOptional()
  method?: LeadDistributionMethod;

  @IsString()
  @IsOptional()
  counsellorId?: string;

  @IsString()
  @IsOptional()
  assignedTo?: string;

  @IsString()
  @IsOptional()
  leadId?: string;

  @IsString()
  @IsOptional()
  source?: string;

  @Type(() => Number)
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number;

  @IsString()
  @IsOptional()
  cursor?: string;
}
