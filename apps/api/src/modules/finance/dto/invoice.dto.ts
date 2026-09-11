import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { InvoiceLineItemType } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsString, IsOptional, IsUUID, IsNumber, Min, IsArray, ValidateNested, IsEnum } from 'class-validator';

export class CreateInvoiceLineItemDto {
  @ApiProperty({ enum: InvoiceLineItemType })
  @IsEnum(InvoiceLineItemType)
  type: InvoiceLineItemType;

  @ApiProperty()
  @IsString()
  description: string;

  @ApiProperty()
  @IsNumber()
  @Min(1)
  quantity: number;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  unitAmount: number;
}

export class CreateInstallmentDto {
  @ApiProperty()
  @IsNumber()
  @Min(1)
  sequence: number;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  amount: number;

  @ApiProperty()
  @IsString()
  dueDate: string; // ISO datetime
}

export class CreateInvoiceDto {
  @ApiProperty()
  @IsUUID()
  studentId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  leadId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  discountAmount?: number;

  @ApiProperty({ type: [CreateInvoiceLineItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateInvoiceLineItemDto)
  lineItems: CreateInvoiceLineItemDto[];

  @ApiPropertyOptional({ type: [CreateInstallmentDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateInstallmentDto)
  installments?: CreateInstallmentDto[];
}
