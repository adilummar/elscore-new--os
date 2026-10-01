import { IsString, IsInt, IsNumber, IsBoolean, IsOptional, Min } from 'class-validator';

export class CreatePricingSlabDto {
  @IsString()
  curriculumId: string;

  @IsInt()
  @Min(0)
  gradeFrom: number;

  @IsInt()
  @Min(0)
  gradeTo: number;

  @IsNumber()
  @Min(0)
  hourlyRate: number;
}

export class UpdatePricingSlabDto {
  @IsBoolean()
  isActive: boolean;
}

export class CreateExceptionalRateDto {
  @IsString()
  subjectId: string;

  @IsNumber()
  @Min(0)
  hourlyRate: number;
}

export class UpdateExceptionalRateDto {
  @IsBoolean()
  isActive: boolean;
}
