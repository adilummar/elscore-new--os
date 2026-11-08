import { ApiPropertyOptional } from '@nestjs/swagger';
import { TutorExceptionKind } from '@prisma/client';
import { IsArray, IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';

/** A date that changes a tutor's weekly pattern. The rules for each kind are checked by TutorExceptionService. */
export class TutorExceptionDto {
  @ApiPropertyOptional({ description: 'YYYY-MM-DD' })
  @IsString()
  date!: string;

  @ApiPropertyOptional({ enum: ['HOLIDAY', 'DAY_OFF', 'EXTRA_HOURS', 'BLOCKED'] })
  @IsEnum(TutorExceptionKind)
  kind!: TutorExceptionKind;

  @ApiPropertyOptional({ description: 'Minutes from midnight, for extra hours and blocked time' })
  @IsInt()
  @IsOptional()
  startMinute?: number;

  @ApiPropertyOptional()
  @IsInt()
  @IsOptional()
  endMinute?: number;

  @ApiPropertyOptional()
  @IsString()
  note!: string;
}

/** The whole weekly availability. Each range is checked by validateAvailability, which is the single set of rules. */
export class ReplaceAvailabilityDto {
  @ApiPropertyOptional({ description: 'Time ranges: { day: 0-6 (0 = Sunday), start: HH:MM, end: HH:MM }' })
  @IsArray()
  windows!: unknown[];
}

export class UpdateTutorProfileDto {
  @ApiPropertyOptional({ description: 'Short bio' })
  @IsString()
  @IsOptional()
  bio?: string;

  @ApiPropertyOptional({ description: 'Profile photo URL' })
  @IsString()
  @IsOptional()
  profilePhotoUrl?: string;
}

export class UpdateTeachingExperienceDto {
  @ApiPropertyOptional({ description: 'Years of teaching experience' })
  @IsInt()
  @Min(0)
  yearsOfExperience: number;
}
