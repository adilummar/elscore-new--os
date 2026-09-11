import { ContactClassification } from '@prisma/client';
import { IsEnum, IsISO8601, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateFollowUpDto {
  /** ISO 8601 datetime string with timezone offset. e.g. '2026-09-12T17:00:00+05:30' */
  @IsISO8601()
  @IsNotEmpty()
  scheduledAt!: string;

  @IsEnum(ContactClassification)
  @IsOptional()
  classification?: ContactClassification;

  @IsString()
  @IsOptional()
  @MaxLength(2000)
  remarks?: string;
}
