import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ReviewCompensationRequestDto {
  @ApiProperty({ description: 'Review status (APPROVED or REJECTED)', enum: ['APPROVED', 'REJECTED'] })
  @IsString()
  @IsNotEmpty()
  @IsIn(['APPROVED', 'REJECTED'], { message: 'status must be either APPROVED or REJECTED' })
  status!: 'APPROVED' | 'REJECTED';

  @ApiPropertyOptional({ description: 'Review note or reason (mandatory for rejection)' })
  @IsOptional()
  @IsString()
  reviewNote?: string;
}
