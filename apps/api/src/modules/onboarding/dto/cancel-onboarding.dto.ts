import { ApiProperty } from '@nestjs/swagger';
import { OnboardingCaseStatus } from '@prisma/client';
import { IsIn, IsNotEmpty, IsString, MinLength } from 'class-validator';

export const CANCELLATION_ONBOARDING_STATUSES = [
  OnboardingCaseStatus.WITHDRAWN,
  OnboardingCaseStatus.NO_SHOW,
  OnboardingCaseStatus.REJECTED,
] as const;

export class CancelOnboardingDto {
  @ApiProperty({
    description: 'Outcome status indicating cancellation or non-joining',
    enum: CANCELLATION_ONBOARDING_STATUSES,
    example: OnboardingCaseStatus.NO_SHOW,
  })
  @IsIn(CANCELLATION_ONBOARDING_STATUSES, {
    message: `status must be one of: ${CANCELLATION_ONBOARDING_STATUSES.join(', ')}`,
  })
  status!: OnboardingCaseStatus;

  @ApiProperty({
    description: 'Mandatory reason or explanation for candidate withdrawal, no-show, or onboarding rejection',
    example: 'Candidate failed to report on confirmed joining date and was unreachable.',
  })
  @IsString()
  @IsNotEmpty({ message: 'reason is mandatory when cancelling onboarding' })
  @MinLength(5, { message: 'reason must be at least 5 characters long' })
  reason!: string;
}
