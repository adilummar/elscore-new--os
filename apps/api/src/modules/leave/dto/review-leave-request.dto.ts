import { IsIn, IsOptional, IsString } from 'class-validator';

export class ReviewLeaveRequestDto {
  @IsIn(['APPROVE', 'REJECT'], { message: 'action must be either APPROVE or REJECT' })
  action: 'APPROVE' | 'REJECT';

  @IsOptional()
  @IsString()
  reviewNote?: string;
}
