import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod } from '@prisma/client';
import { IsString, IsOptional, IsUUID, IsNumber, Min, IsEnum } from 'class-validator';

export class RecordPaymentDto {
  @ApiProperty()
  @IsUUID()
  invoiceId: string;

  @ApiProperty()
  @IsNumber()
  @Min(0.01)
  amount: number;

  @ApiProperty({ enum: PaymentMethod })
  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;

  @ApiProperty()
  @IsString()
  idempotencyKey: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}

export class ReversePaymentDto {
  @ApiProperty()
  @IsString()
  reversalReason: string;
}

export class RequestRefundDto {
  @ApiProperty()
  @IsUUID()
  paymentId: string;

  @ApiProperty()
  @IsNumber()
  @Min(0.01)
  amount: number;

  @ApiProperty()
  @IsString()
  reason: string;
}
