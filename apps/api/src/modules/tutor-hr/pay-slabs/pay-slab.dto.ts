import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNumber,
  IsPositive,
  IsString,
  Max,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

import { PAY_SLAB_CURRENCIES } from './pay-slab.constants';

export class PaySlabRateDto {
  @ApiProperty({ example: 'GRADE_9' })
  @IsString()
  gradeCode: string;

  @ApiProperty({ example: 140 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(99999999.99)
  rate: number;
}

/**
 * Salary slabs are created once and never edited or deleted. The request carries all 13 grade rates
 * (KG..Grade 12); the screen's band input (for example KG-8 = 130) is expanded before it gets here.
 */
export class CreatePaySlabDto {
  @ApiProperty({ example: 'French' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name: string;

  @ApiProperty({ enum: PAY_SLAB_CURRENCIES, default: 'INR' })
  @IsIn([...PAY_SLAB_CURRENCIES])
  currency: string;

  @ApiProperty({
    type: [PaySlabRateDto],
    description: 'Exactly one rate for each grade KG to Grade 12',
  })
  @IsArray()
  @ArrayMinSize(13)
  @ArrayMaxSize(13)
  @ValidateNested({ each: true })
  @Type(() => PaySlabRateDto)
  rates: PaySlabRateDto[];
}
