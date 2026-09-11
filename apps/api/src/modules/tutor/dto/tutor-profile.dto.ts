import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

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
