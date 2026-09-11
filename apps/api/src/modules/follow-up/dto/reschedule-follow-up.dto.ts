import { IsISO8601, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class RescheduleFollowUpDto {
  /** New scheduled datetime. ISO 8601 with timezone offset. */
  @IsISO8601()
  @IsNotEmpty()
  newScheduledAt!: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  reason?: string;
}
