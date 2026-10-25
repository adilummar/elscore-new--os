import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ApplicationStage, ApplicationStatus } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class TransitionStageDto {
  @ApiProperty({ enum: ApplicationStage })
  @IsEnum(ApplicationStage)
  stage!: ApplicationStage;

  @ApiProperty({ enum: ApplicationStatus })
  @IsEnum(ApplicationStatus)
  status!: ApplicationStatus;

  @ApiPropertyOptional({ description: 'Stage transition notes' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ description: 'Mandatory rationale if rejecting candidate' })
  @IsOptional()
  @IsString()
  rejectionReason?: string;

  @ApiPropertyOptional({ description: 'Mandatory rationale if candidate withdrew' })
  @IsOptional()
  @IsString()
  withdrawnReason?: string;
}
