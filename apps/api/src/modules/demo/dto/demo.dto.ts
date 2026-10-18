import { IsString, IsNotEmpty, IsDateString, IsNumber, Min, Max, IsOptional, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

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

export class RescheduleDemoDto {
  @IsDateString()
  scheduledAt: string;

  @IsNumber()
  @Min(30)
  @Max(120)
  durationMinutes: number;

  @IsString()
  @IsNotEmpty()
  reason: string;
}

export class AssignTutorDto {
  @IsString()
  @IsNotEmpty()
  tutorId: string;
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
}

export class NoShowDemoDto {
  @IsString()
  @IsNotEmpty()
  reason: string;
}

export class EditDemoDto {
  @IsString()
  @IsOptional()
  studentId?: string;

  @IsString()
  @IsOptional()
  requirementId?: string;
}
