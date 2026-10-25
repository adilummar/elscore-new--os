import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DocumentVerificationStatus } from '@prisma/client';
import { IsIn, IsNotEmpty, IsOptional, IsString, ValidateIf } from 'class-validator';

export const VERIFICATION_DECISION_STATUSES = [
  DocumentVerificationStatus.VERIFIED,
  DocumentVerificationStatus.REJECTED,
] as const;

export class VerifyDocumentDto {
  @ApiProperty({
    description: 'Verification outcome',
    enum: VERIFICATION_DECISION_STATUSES,
    example: DocumentVerificationStatus.VERIFIED,
  })
  @IsIn(VERIFICATION_DECISION_STATUSES, {
    message: `status must be one of: ${VERIFICATION_DECISION_STATUSES.join(', ')}`,
  })
  status!: DocumentVerificationStatus;

  @ApiPropertyOptional({
    description: 'Verification notes or rejection explanation (mandatory if REJECTED)',
    example: 'Document matches government passport standards.',
  })
  @ValidateIf((o) => o.status === DocumentVerificationStatus.REJECTED)
  @IsNotEmpty({ message: 'verificationNotes is mandatory when rejecting a document' })
  @IsString()
  verificationNotes?: string;
}
