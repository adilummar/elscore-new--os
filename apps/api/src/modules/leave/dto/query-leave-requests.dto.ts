import { IsEnum, IsOptional, IsString } from 'class-validator';
import { LeaveRequestStatus } from '@prisma/client';

export class QueryLeaveRequestsDto {
  @IsOptional()
  @IsEnum(LeaveRequestStatus)
  status?: LeaveRequestStatus;

  @IsOptional()
  @IsString()
  employeeId?: string;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;
}
