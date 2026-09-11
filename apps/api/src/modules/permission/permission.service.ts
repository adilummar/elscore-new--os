import { Injectable, NotFoundException } from '@nestjs/common';
import { Permission } from '@prisma/client';

import { paginate, PaginateOptions } from '../../common/pagination/paginate.util';
import { PaginatedResponseDto } from '../../common/pagination/pagination.dto';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class PermissionService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(options: Pick<PaginateOptions, 'limit' | 'cursor'>): Promise<PaginatedResponseDto<Permission>> {
    return paginate(this.prisma.permission, {
      ...options,
      orderBy: { id: 'asc' },
    });
  }

  async findOne(id: string): Promise<Permission> {
    const permission = await this.prisma.permission.findUnique({
      where: { id },
    });

    if (!permission) {
      throw new NotFoundException(`Permission with ID ${id} not found`);
    }

    return permission;
  }
}
