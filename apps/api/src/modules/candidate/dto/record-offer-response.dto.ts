import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class RecordOfferResponseDto {
  @ApiProperty({ enum: ['ACCEPT', 'DECLINE'], description: 'Candidate response decision' })
  @IsString()
  @IsNotEmpty()
  @IsIn(['ACCEPT', 'DECLINE'])
  decision!: 'ACCEPT' | 'DECLINE';

  @ApiPropertyOptional({ description: 'Candidate response notes or handover remarks' })
  @IsOptional()
  @IsString()
  responseNotes?: string;

  @ApiPropertyOptional({ description: 'Mandatory reason if candidate declined the offer' })
  @IsOptional()
  @IsString()
  declineReason?: string;
}
