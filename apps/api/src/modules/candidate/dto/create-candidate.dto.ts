import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CandidateSource } from '@prisma/client';
import { IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateCandidateDto {
  @ApiProperty({ description: 'Candidate full legal/preferred name', example: 'Sarah Jenkins' })
  @IsString()
  @IsNotEmpty()
  @MinLength(2, { message: 'fullName must be at least 2 characters long' })
  fullName!: string;

  @ApiProperty({ description: 'Contact email address', example: 'sarah.j@example.com' })
  @IsEmail({}, { message: 'email must be a valid email address' })
  @IsNotEmpty()
  email!: string;

  @ApiPropertyOptional({ description: 'Contact phone number', example: '+971501234567' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ enum: CandidateSource, default: CandidateSource.DIRECT_APPLICATION })
  @IsOptional()
  @IsEnum(CandidateSource)
  source?: CandidateSource;

  @ApiPropertyOptional({ description: 'Referral notes or referring employee details' })
  @IsOptional()
  @IsString()
  referralDetails?: string;

  @ApiPropertyOptional({ description: 'Initial recruiter notes or profile overview' })
  @IsOptional()
  @IsString()
  notes?: string;
}
