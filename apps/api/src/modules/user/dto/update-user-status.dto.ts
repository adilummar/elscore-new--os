import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateUserStatusDto {
  @ApiProperty({ enum: UserStatus, description: 'New status' })
  @IsEnum(UserStatus)
  status: UserStatus;

  @ApiPropertyOptional({ description: 'Reason for status change' })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  reason?: string;
}
