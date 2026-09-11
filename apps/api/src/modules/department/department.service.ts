import { Injectable, NotFoundException } from '@nestjs/common';
import { Department, DepartmentStatus } from '@prisma/client';

import { paginate, PaginateOptions } from '../../common/pagination/paginate.util';
import { PaginatedResponseDto } from '../../common/pagination/pagination.dto';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class DepartmentService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(options: Pick<PaginateOptions, 'limit' | 'cursor'>): Promise<PaginatedResponseDto<Department>> {
    return paginate(this.prisma.department, {
      ...options,
      orderBy: { id: 'asc' },
    });
  }

  async findOne(id: string): Promise<Department> {
    const department = await this.prisma.department.findUnique({
      where: { id },
    });
    if (!department) {
      throw new NotFoundException(`Department with ID ${id} not found`);
    }
    return department;
  }

  async updateStatus(id: string, status: DepartmentStatus): Promise<Department> {
    await this.findOne(id); // Ensure it exists
    return this.prisma.department.update({
      where: { id },
      data: { status },
    });
  }
}
