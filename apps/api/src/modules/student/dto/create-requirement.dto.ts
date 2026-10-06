import { IsNotEmpty, IsOptional, IsString, IsUUID, IsNumber } from 'class-validator';

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
  
  @IsNumber()
  @IsOptional()
  monthlyHours?: number;

  @IsString()
  @IsOptional()
  syllabus?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
