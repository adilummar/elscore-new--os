import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class ReassignLeadDto {
  @IsUUID()
  @IsNotEmpty()
  assignedToUserId!: string;

  @IsString()
  @IsOptional()
  reason?: string;
}
