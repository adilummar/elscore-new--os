import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID } from 'class-validator';

export class ApproveTutorLeadDto {
  @ApiPropertyOptional({ description: 'If not provided, a new Employee and User will be created.' })
  @IsOptional()
  @IsUUID()
  existingEmployeeId?: string;

  @ApiPropertyOptional({ description: 'Required if creating a new user' })
  @IsOptional()
  @IsString()
  password?: string;

  @ApiPropertyOptional({ description: 'Required if creating a new user' })
  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @ApiPropertyOptional({ description: 'Required if creating a new user' })
  @IsOptional()
  @IsUUID()
  roleId?: string;
}
