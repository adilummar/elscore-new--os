import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsUUID } from 'class-validator';

export class DelegatePermissionDto {
  @ApiProperty({ description: 'Permission ID to delegate' })
  @IsUUID()
  @IsNotEmpty()
  permissionId: string;
}
