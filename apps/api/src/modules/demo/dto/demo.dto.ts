import { IsString, IsNotEmpty, IsDateString, IsNumber, Min, Max, IsOptional, IsArray, ValidateNested, MinLength, IsUrl, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';
import { ParentConfirmationChannel } from '@prisma/client';

export class DemoSessionItemDto {
  @IsNumber()
  @IsOptional()
  sessionOrder?: number;

  @IsString()
  @IsNotEmpty()
  requirementId: string;

  @IsDateString()
  scheduledStart: string;

  @IsDateString()
  @IsOptional()
  scheduledEnd?: string;

  @IsNumber()
  @Min(15)
  @Max(180)
  durationMinutes: number;

  @IsString()
  @IsOptional()
  subjectId?: string;

  @IsString()
  @IsOptional()
  curriculumId?: string;

  @IsString()
  @IsOptional()
  gradeId?: string;
}

export class CreateDemoDto {
  @IsString()
  @IsOptional()
  leadId?: string;

  @IsString()
  @IsNotEmpty()
  studentId: string;

  @IsString()
  @IsOptional()
  requirementId?: string;

  @IsDateString()
  @IsOptional()
  scheduledAt?: string;

  @IsNumber()
  @Min(15)
  @Max(180)
  @IsOptional()
  durationMinutes?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DemoSessionItemDto)
  @IsOptional()
  sessions?: DemoSessionItemDto[];

  @IsString()
  @IsOptional()
  idempotencyKey?: string;
}

export class SavePreparationDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(15, { message: 'Preparation notes ("How to take the class") must be at least 15 characters' })
  preparationNotes: string;
}

export class RecordMeetingLinkDto {
  @IsString()
  @IsNotEmpty()
  @IsUrl({}, { message: 'Meeting link must be a valid URL' })
  meetingLink: string;

  @IsString()
  @IsOptional()
  meetingPlatform?: string;

  @IsString()
  @IsOptional()
  sessionId?: string;

  @IsString()
  @IsOptional()
  changeReason?: string;
}

export class ConfirmParentMeetingDto {
  @IsEnum(ParentConfirmationChannel)
  confirmationChannel: ParentConfirmationChannel;

  @IsString()
  @IsOptional()
  confirmationNotes?: string;
}

export class ReassignCoordinatorDto {
  @IsString()
  @IsNotEmpty()
  coordinatorId: string;

  @IsString()
  @IsNotEmpty()
  reason: string;
}

export class RescheduleDemoDto {
  @IsDateString()
  scheduledAt: string;

  @IsNumber()
  @Min(15)
  @Max(180)
  durationMinutes: number;

  @IsString()
  @IsNotEmpty()
  reason: string;

  @IsString()
  @IsOptional()
  sessionId?: string;
}

export class AssignTutorDto {
  @IsString()
  @IsNotEmpty()
  tutorId: string;

  @IsString()
  @IsOptional()
  sessionId?: string;
}

export class CompleteDemoDto {
  @IsNumber()
  @Min(1)
  @Max(5)
  rating: number;

  @IsString()
  @IsNotEmpty()
  comments: string;

  // Tutor feedback
  @IsString()
  @IsOptional()
  studentPerformance?: string;

  @IsString()
  @IsOptional()
  strengths?: string;

  @IsString()
  @IsOptional()
  weaknesses?: string;

  @IsString()
  @IsOptional()
  tutorRecommendations?: string;

  @IsNumber()
  @IsOptional()
  tutorRating?: number;

  // Coordinator feedback
  @IsString()
  @IsOptional()
  academicAssessment?: string;

  @IsString()
  @IsOptional()
  engagementLevel?: string;

  @IsString()
  @IsOptional()
  learningBehaviour?: string;

  @IsString()
  @IsOptional()
  coordinatorRemarks?: string;

  // Parent feedback
  @IsString()
  @IsOptional()
  parentFeedback?: string;

  @IsString()
  @IsOptional()
  parentConcerns?: string;

  @IsString()
  @IsOptional()
  parentInterestLevel?: string;

  // Post-demo Academic Roadmap
  @IsString()
  @IsOptional()
  recommendationPlan?: string;

  @IsNumber()
  @IsOptional()
  recommendedClassCount?: number;

  @IsString()
  @IsOptional()
  recommendedFrequency?: string;

  @IsNumber()
  @IsOptional()
  preferredDurationMin?: number;

  @IsString()
  @IsOptional()
  preferredTiming?: string;

  @IsOptional()
  recommendedSubjects?: any;

  @IsString()
  @IsOptional()
  roadmapRemarks?: string;

  // Post-demo Academic Plan
  @IsString()
  @IsOptional()
  learningGoal?: string;

  @IsString()
  @IsOptional()
  targetChapters?: string;

  @IsString()
  @IsOptional()
  studyApproach?: string;

  @IsString()
  @IsOptional()
  milestones?: string;

  // Attendances
  @IsOptional()
  attendances?: {
    parentStatus?: any;
    coordinatorStatus?: any;
    tutorStatus?: any;
  };
}

export class CancelDemoDto {
  @IsString()
  @IsNotEmpty()
  reason: string;

  @IsString()
  @IsOptional()
  sessionId?: string;
}

export class NoShowDemoDto {
  @IsString()
  @IsNotEmpty()
  reason: string;

  @IsString()
  @IsOptional()
  sessionId?: string;
}

export class EditDemoDto {
  @IsString()
  @IsOptional()
  studentId?: string;

  @IsString()
  @IsOptional()
  requirementId?: string;
}
