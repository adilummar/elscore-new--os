import { ApiProperty } from '@nestjs/swagger';
import { DepartmentStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdateDepartmentStatusDto {
  @ApiProperty({ enum: DepartmentStatus, description: 'The new status of the department' })
  @IsEnum(DepartmentStatus)
  status: DepartmentStatus;
}
