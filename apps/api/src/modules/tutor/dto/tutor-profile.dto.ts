import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsInt, IsOptional, IsString, Min } from 'class-validator';

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
