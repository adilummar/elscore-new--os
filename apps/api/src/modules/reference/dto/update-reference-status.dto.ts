import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdateReferenceStatusDto {
  @ApiProperty({ description: 'Is the reference data active?' })
  @IsBoolean()
  isActive: boolean;
}
