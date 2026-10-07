import { IsString, IsInt, IsNumber, IsBoolean, IsOptional, IsNotEmpty, Min, Equals } from 'class-validator';

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
  @IsNotEmpty()
  subjectId: string;

  @IsString()
  @IsNotEmpty()
  gradeId: string;

  @IsNumber()
  @Min(0)
  hourlyRate: number;
}

export class UpdateExceptionalRateDto {
  @IsBoolean()
  isActive: boolean;
}

export class UpsertFinanceSettingDto {
  @IsNumber()
  @Min(0)
  registrationFee: number;

  @IsString()
  accountHolderName: string;

  @IsString()
  bankName: string;

  @IsString()
  accountNumber: string;

  @IsString()
  iban: string;

  @IsOptional()
  @Equals('AED')
  currency?: string;
}

