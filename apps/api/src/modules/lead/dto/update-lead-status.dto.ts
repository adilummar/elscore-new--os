import { LeadStatus } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpdateLeadStatusDto {
  @IsEnum(LeadStatus)
  @IsNotEmpty()
  status!: LeadStatus;

  @IsString()
  @IsNotEmpty()
  reason!: string;

  @IsString()
  @IsOptional()
  note?: string;
}
