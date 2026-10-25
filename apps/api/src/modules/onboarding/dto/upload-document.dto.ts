import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OnboardingDocumentType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';

export const ALLOWED_ONBOARDING_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export class UploadDocumentDto {
  @ApiProperty({
    enum: OnboardingDocumentType,
    example: OnboardingDocumentType.PASSPORT,
    description: 'Classification of the onboarding document',
  })
  @IsEnum(OnboardingDocumentType)
  documentType!: OnboardingDocumentType;

  @ApiProperty({
    description: 'Display title of document',
    example: 'Passport Front & Back',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(2, { message: 'title must be at least 2 characters long' })
  title!: string;

  @ApiPropertyOptional({
    description:
      'Client-supplied path is ignored; server generates safe private storage path',
    example: 'storage/private/onboarding/cases/case-123/doc.pdf',
  })
  @IsOptional()
  @IsString()
  filePath?: string;

  @ApiPropertyOptional({
    description: 'Client-supplied key is ignored; server generates safe key',
    example: 'cases/case-123/uuid.pdf',
  })
  @IsOptional()
  @IsString()
  fileKey?: string;

  @ApiPropertyOptional({
    description: 'Original file name uploaded by user (overridden by uploaded file)',
    example: 'my_passport.pdf',
  })
  @IsOptional()
  @IsString()
  fileName?: string;

  @ApiPropertyOptional({
    description: 'File size in bytes (max 10MB)',
    example: 1048576,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1, { message: 'fileSize must be positive' })
  @Max(10 * 1024 * 1024, { message: 'fileSize cannot exceed 10MB' })
  fileSize?: number;

  @ApiPropertyOptional({
    description: 'MIME type of document',
    example: 'application/pdf',
    enum: ALLOWED_ONBOARDING_MIME_TYPES,
  })
  @IsOptional()
  @IsString()
  @IsIn(ALLOWED_ONBOARDING_MIME_TYPES, {
    message: `mimeType must be one of: ${ALLOWED_ONBOARDING_MIME_TYPES.join(', ')}`,
  })
  mimeType?: string;
}
