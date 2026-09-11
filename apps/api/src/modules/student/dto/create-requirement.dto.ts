import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateRequirementDto {
  @IsUUID()
  @IsNotEmpty()
  subjectId!: string;

  @IsUUID()
  @IsNotEmpty()
  curriculumId!: string;

  @IsUUID()
  @IsNotEmpty()
  gradeId!: string;

  @IsString()
  @IsOptional()
  syllabus?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
