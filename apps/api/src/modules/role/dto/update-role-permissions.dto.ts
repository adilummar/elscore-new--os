import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsUUID } from 'class-validator';

export enum RolePermissionAction {
  ADD = 'ADD',
  REMOVE = 'REMOVE',
}

export class UpdateRolePermissionsDto {
  @ApiProperty({ enum: RolePermissionAction, description: 'Action to perform' })
  @IsEnum(RolePermissionAction)
  action: RolePermissionAction;

  @ApiProperty({ description: 'ID of the permission to add or remove' })
  @IsUUID()
  @IsNotEmpty()
  permissionId: string;
}
