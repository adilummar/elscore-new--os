import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class WithdrawOfferDto {
  @ApiProperty({ description: 'Mandatory reason for offer withdrawal by the organization', example: 'Position cancelled due to internal budget re-allocation' })
  @IsString()
  @IsNotEmpty({ message: 'withdrawalReason cannot be empty' })
  @MinLength(5, { message: 'withdrawalReason must be at least 5 characters long' })
  withdrawalReason!: string;
}
