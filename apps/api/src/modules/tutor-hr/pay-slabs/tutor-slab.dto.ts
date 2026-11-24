import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** Give a tutor a slab (first slab: this month; a change: from next month). The reason is mandatory. */
export class AssignTutorSlabDto {
  @ApiProperty()
  @IsUUID()
  slabId: string;

  @ApiProperty({ example: 'Promoted after the quarterly review' })
  @Transform(trim)
  @IsString()
  @MinLength(1, { message: 'A reason is required' })
  @MaxLength(500)
  reason: string;
}

export class CancelSlabChangeDto {
  @ApiProperty({ example: 'Entered for the wrong tutor' })
  @Transform(trim)
  @IsString()
  @MinLength(1, { message: 'A reason is required' })
  @MaxLength(500)
  reason: string;
}
