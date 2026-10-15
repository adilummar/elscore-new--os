import { IsString, IsNumber, IsOptional, Min, IsArray, ValidateNested, IsUUID } from 'class-validator';
import { Type } from 'class-transformer';

export class SubjectHoursDto {
  @IsUUID()
  subjectId!: string;

  @IsNumber()
  @Min(0.01)
  monthlyHours!: number;
}

export class GenerateQuotationDto {
  @IsString()
  studentId!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  offerHourlyRate?: number;

  @IsOptional()
  @IsString()
  quotationNotes?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SubjectHoursDto)
  subjectHours?: SubjectHoursDto[];
}

