import { ContactClassification } from '@prisma/client';
import { IsEnum, IsISO8601, IsOptional, IsString, MaxLength, ValidateIf, IsNotEmpty } from 'class-validator';

export class CompleteFollowUpDto {
  @IsEnum(ContactClassification)
  @IsOptional()
  classification?: ContactClassification;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  remarks!: string;

  /**
   * Optional: create the next Follow-up in the same atomic action.
   * ISO 8601 datetime string with timezone offset.
   */
  @IsISO8601()
  @IsOptional()
  nextFollowUpAt?: string;

  @ValidateIf(o => o.nextFollowUpAt != null)
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  nextFollowUpRemarks?: string;
}
