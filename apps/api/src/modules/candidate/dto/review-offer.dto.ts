import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ReviewOfferDto {
  @ApiProperty({ enum: ['APPROVE', 'REJECT'], description: 'Management offer decision' })
  @IsString()
  @IsNotEmpty()
  @IsIn(['APPROVE', 'REJECT'])
  action!: 'APPROVE' | 'REJECT';

  @ApiPropertyOptional({ description: 'Approval notes or mandatory rejection rationale' })
  @IsOptional()
  @IsString()
  approvalNotes?: string;
}
