import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EmploymentStatus } from '@prisma/client';
import { IsEnum, IsString, MaxLength, ValidateIf } from 'class-validator';

export class UpdateEmployeeStatusDto {
  @ApiProperty({ enum: EmploymentStatus, description: 'New employment status' })
  @IsEnum(EmploymentStatus)
  status: EmploymentStatus;

  @ApiPropertyOptional({ description: 'Mandatory reason if status is TERMINATED or REACTIVATED' })
  @ValidateIf((o) => o.status === EmploymentStatus.TERMINATED || o.status === EmploymentStatus.ACTIVE /* Assuming Rehire sets to ACTIVE or similar? The spec says 'Rehire flow' */)
  @IsString()
  @MaxLength(500)
  reason?: string;
}
