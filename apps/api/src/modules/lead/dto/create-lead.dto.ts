import { LeadSource } from '@prisma/client';
import { IsBoolean, IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateLeadDto {
  @IsString()
  @IsOptional()
  @MaxLength(100)
  firstName?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  lastName?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  primaryPhone!: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  altPhone1?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  altPhone2?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  whatsappNumber?: string;

  @IsEnum(LeadSource)
  @IsNotEmpty()
  source!: LeadSource;

  // Manual Marketing / Attribution support
  @IsString()
  @IsOptional()
  @MaxLength(100)
  channel?: string;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  campaign?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  externalCampaignId?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  externalLeadId?: string;
}
