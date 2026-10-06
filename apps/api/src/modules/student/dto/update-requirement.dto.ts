import { IsOptional, IsString, IsUUID, IsNumber } from 'class-validator';

export class UpdateRequirementDto {
  @IsUUID() @IsOptional() subjectId?: string;
  @IsUUID() @IsOptional() curriculumId?: string;
  @IsUUID() @IsOptional() gradeId?: string;
  @IsNumber() @IsOptional() monthlyHours?: number;
  @IsString() @IsOptional() syllabus?: string;
  @IsString() @IsOptional() notes?: string;
}
