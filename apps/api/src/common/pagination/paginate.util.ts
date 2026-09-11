import { PaginatedResponseDto } from './pagination.dto';

export interface PaginateOptions {
  where?: unknown;
  orderBy?: unknown;
  limit?: number;
  cursor?: string;
  include?: unknown;
  select?: unknown;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface PrismaModelDelegate<T> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  findMany(args: any): Promise<T[]>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  count(args: any): Promise<number>;
}

/**
 * Encodes an ID to an opaque cursor string (base64)
 */
export function encodeCursor(id: string): string {
  return Buffer.from(id).toString('base64');
}

/**
 * Decodes an opaque cursor string (base64) to an ID
 */
export function decodeCursor(cursor: string): string {
  return Buffer.from(cursor, 'base64').toString('ascii');
}

/**
 * Shared utility for cursor-based pagination with Prisma.
 *
 * @param prismaModel The prisma model delegate (e.g. prisma.user)
 * @param options Pagination options
 */
export async function paginate<T extends { id: string }>(
  prismaModel: PrismaModelDelegate<T>,
  {
    where,
    orderBy = { id: 'asc' }, // MUST be stable sort, id is required
    limit = 20,
    cursor,
    include,
    select,
  }: PaginateOptions,
): Promise<PaginatedResponseDto<T>> {
  const take = Math.min(limit + 1, 101); // fetch one extra to detect hasNextPage

  const items = await prismaModel.findMany({
    where,
    orderBy,
    take,
    ...(cursor ? { cursor: { id: decodeCursor(cursor) }, skip: 1 } : {}),
    ...(include ? { include } : {}),
    ...(select ? { select } : {}),
  });

  const hasNextPage = items.length > limit;
  const data = hasNextPage ? items.slice(0, limit) : items;
  
  // Ensure we extract ID correctly. Fallback to `items[items.length - 1]?.id` if needed, 
  // but items should be typed properly in the caller.
  const nextCursor = hasNextPage && data.length > 0 ? encodeCursor((data[data.length - 1]).id) : null;

  return {
    data,
    pagination: {
      nextCursor,
      hasNextPage,
      limit,
    },
  };
}
