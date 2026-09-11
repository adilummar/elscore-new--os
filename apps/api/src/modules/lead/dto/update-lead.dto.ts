import { LeadSource } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateLeadDto {
  @IsString()
  @IsOptional()
  @MaxLength(100)
  firstName?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  lastName?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  primaryPhone?: string;

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
  @IsOptional()
  source?: LeadSource;
}
