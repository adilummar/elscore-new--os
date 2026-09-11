import { IsString, IsOptional, IsNotEmpty, MaxLength } from 'class-validator';

export class IngestMarketingEventDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName!: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  lastName?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  primaryPhone!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  externalLeadId!: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  campaignId?: string;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  campaignName?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  adsetId?: string;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  adsetName?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  adId?: string;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  adName?: string;
}
