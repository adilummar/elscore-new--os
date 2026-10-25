import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateApplicationDto {
  @ApiProperty({ description: 'Existing Candidate UUID' })
  @IsString()
  @IsNotEmpty()
  candidateId!: string;

  @ApiPropertyOptional({ description: 'Candidate cover letter or executive pitch' })
  @IsOptional()
  @IsString()
  coverLetter?: string;

  @ApiPropertyOptional({ description: 'Link to stored CV / resume document' })
  @IsOptional()
  @IsString()
  resumeUrl?: string;
}
