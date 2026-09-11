import { Type } from 'class-transformer';
import { IsDate, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateStudentDto {
  @IsString()
  @IsNotEmpty()
  leadId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName!: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  lastName?: string;

  @Type(() => Date)
  @IsDate()
  @IsOptional()
  dateOfBirth?: Date;

  @IsString()
  @IsOptional()
  gender?: string;

  @IsString()
  @IsOptional()
  schoolName?: string;

  @IsString()
  @IsOptional()
  currentGrade?: string;

  @IsString()
  @IsOptional()
  cityLocation?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
