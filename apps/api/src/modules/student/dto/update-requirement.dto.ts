import { IsOptional, IsString, IsUUID } from 'class-validator';

export class UpdateRequirementDto {
  @IsUUID() @IsOptional() subjectId?: string;
  @IsUUID() @IsOptional() curriculumId?: string;
  @IsUUID() @IsOptional() gradeId?: string;
  @IsString() @IsOptional() syllabus?: string;
  @IsString() @IsOptional() notes?: string;
}
