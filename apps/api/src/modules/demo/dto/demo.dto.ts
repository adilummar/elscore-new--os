import { IsString, IsNotEmpty, IsDateString, IsNumber, Min, Max, IsOptional } from 'class-validator';

export class CreateDemoDto {
  @IsString()
  @IsNotEmpty()
  studentId: string;

  @IsString()
  @IsNotEmpty()
  requirementId: string;

  @IsDateString()
  scheduledAt: string;

  @IsNumber()
  @Min(30)
  @Max(120)
  durationMinutes: number;
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
