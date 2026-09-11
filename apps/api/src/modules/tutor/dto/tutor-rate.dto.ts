import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, Min } from 'class-validator';

export class SetTutorRateDto {
  @ApiProperty({ description: 'Hourly rate amount' })
  @IsNumber()
  @Min(0)
  hourlyRate: number;
}
