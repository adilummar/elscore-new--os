import { ContactClassification, LeadStatus } from '@prisma/client';
import { IsEnum, IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';

export class CompleteFollowUpDto {
  @IsEnum(ContactClassification)
  @IsOptional()
  classification?: ContactClassification;

  @IsString()
  @IsOptional()
  @MaxLength(2000)
  remarks?: string;

  /**
   * Optional: change Lead status in the same atomic action.
   * If provided, leadStatusReason is required (enforced at service layer).
   */
  @IsEnum(LeadStatus)
  @IsOptional()
  newLeadStatus?: LeadStatus;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  leadStatusReason?: string;

  /**
   * Optional: create the next Follow-up in the same atomic action.
   * ISO 8601 datetime string with timezone offset.
   */
  @IsISO8601()
  @IsOptional()
  nextFollowUpAt?: string;

  @IsString()
  @IsOptional()
  @MaxLength(2000)
  nextFollowUpRemarks?: string;
}
