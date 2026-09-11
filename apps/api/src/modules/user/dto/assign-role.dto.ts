import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsUUID } from 'class-validator';

export class AssignRoleDto {
  @ApiProperty({ description: 'Role ID to assign' })
  @IsUUID()
  @IsNotEmpty()
  roleId: string;
}
