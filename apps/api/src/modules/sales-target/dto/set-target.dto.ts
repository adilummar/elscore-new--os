import { IsEnum, IsNumber, IsString } from 'class-validator';
import { SalesTargetType } from '@prisma/client';

export class SetSalesTargetDto {
  @IsString()
  userId!: string;

  @IsNumber()
  periodMonth!: number;

  @IsNumber()
  periodYear!: number;

  @IsEnum(SalesTargetType)
  targetType!: SalesTargetType;

  @IsNumber()
  targetValue!: number;
}
