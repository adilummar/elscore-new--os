import { ContactClassification } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

/** Update classification and/or remarks on an active (SCHEDULED/OVERDUE) Follow-up. */
export class UpdateFollowUpDto {
  @IsEnum(ContactClassification)
  @IsOptional()
  classification?: ContactClassification;

  @IsString()
  @IsOptional()
  @MaxLength(2000)
  remarks?: string;
}
