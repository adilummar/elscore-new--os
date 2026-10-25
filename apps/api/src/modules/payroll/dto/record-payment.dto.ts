import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class RecordPaymentDto {
  @ApiPropertyOptional({ description: 'External transaction reference / UTR / check number', example: 'UTR-9876543210' })
  @IsOptional()
  @IsString()
  paymentReference?: string;

  @ApiPropertyOptional({ description: 'Optional payment notes or confirmation details', example: 'Processed via NEFT' })
  @IsOptional()
  @IsString()
  paymentNotes?: string;
}
