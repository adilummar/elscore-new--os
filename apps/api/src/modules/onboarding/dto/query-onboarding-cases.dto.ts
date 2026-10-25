import { ApiPropertyOptional } from '@nestjs/swagger';
import { OnboardingCaseStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class QueryOnboardingCasesDto {
  @ApiPropertyOptional({ enum: OnboardingCaseStatus })
  @IsOptional()
  @IsEnum(OnboardingCaseStatus)
  status?: OnboardingCaseStatus;

  @ApiPropertyOptional({ description: 'Search by candidate name, email, or business ID' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
