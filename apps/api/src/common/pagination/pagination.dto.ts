import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Number of items to return (max 100)',
    default: 20,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({
    description: 'Opaque cursor for the next page',
  })
  @IsOptional()
  @IsString()
  cursor?: string;
}

export class PaginationMetaDto {
  @ApiProperty({ description: 'Opaque cursor for the next page. Null if no more pages.', nullable: true })
  nextCursor: string | null;

  @ApiProperty({ description: 'True if there is a next page.' })
  hasNextPage: boolean;

  @ApiProperty({ description: 'The limit that was used for this request.' })
  limit: number;
}

export class PaginatedResponseDto<T> {
  @ApiProperty({ description: 'Array of data items' })
  data: T[];

  @ApiProperty({ type: PaginationMetaDto, description: 'Pagination metadata' })
  pagination: PaginationMetaDto;
}
