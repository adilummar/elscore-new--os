import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

export class ReviewVacancyDto {
  @ApiProperty({ enum: ['APPROVE', 'REJECT'], description: 'Approval decision' })
  @IsString()
  @IsNotEmpty()
  @IsIn(['APPROVE', 'REJECT'])
  action!: 'APPROVE' | 'REJECT';

  @ApiPropertyOptional({ description: 'Review note or justification for rejection' })
  @IsOptional()
  @IsString()
  reviewNote?: string;
}
