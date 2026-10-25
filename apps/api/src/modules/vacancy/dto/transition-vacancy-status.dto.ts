import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { VacancyStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class TransitionVacancyStatusDto {
  @ApiProperty({ enum: VacancyStatus, description: 'Target lifecycle status' })
  @IsNotEmpty()
  @IsEnum(VacancyStatus)
  status!: VacancyStatus;

  @ApiPropertyOptional({ description: 'Optional operational reason or status note' })
  @IsOptional()
  @IsString()
  note?: string;

  @ApiPropertyOptional({ description: 'Updated filled headcount count (if hiring occurred)', example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  filledHeadcount?: number;
}
