import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

export class CreatePayrollRunDto {
  @ApiProperty({ description: 'Payroll period start date in YYYY-MM-DD format', example: '2026-10-01' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'periodStart must match YYYY-MM-DD format' })
  periodStart!: string;

  @ApiProperty({ description: 'Payroll period end date in YYYY-MM-DD format', example: '2026-10-31' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'periodEnd must match YYYY-MM-DD format' })
  periodEnd!: string;

  @ApiPropertyOptional({ description: 'Optional operational notes for the payroll run' })
  @IsOptional()
  @IsString()
  notes?: string;
}
