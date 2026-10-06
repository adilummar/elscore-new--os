import { IsString, IsNumber, IsOptional, Min } from 'class-validator';

export class GenerateQuotationDto {
  @IsString()
  studentId: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  offerHourlyRate?: number;

  @IsOptional()
  @IsString()
  quotationNotes?: string;
}
