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
