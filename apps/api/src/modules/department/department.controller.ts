import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Department } from '@prisma/client';

import { PaginationQueryDto } from '../../common/pagination/pagination.dto';
import { RbacGuard } from '../../common/rbac/rbac.guard';
import { RequirePermissions } from '../../common/rbac/require-permissions.decorator';

import { DepartmentService } from './department.service';
import { UpdateDepartmentStatusDto } from './dto/update-department-status.dto';

@ApiTags('Departments')
@ApiBearerAuth()
@Controller('departments')
export class DepartmentController {
  constructor(private readonly departmentService: DepartmentService) {}

  @Get()
  @ApiOperation({ summary: 'List all departments' })
  async findAll(@Query() query: PaginationQueryDto) {
    return this.departmentService.findAll({
      limit: query.limit,
      cursor: query.cursor,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a department by ID' })
  async findOne(@Param('id') id: string): Promise<Department> {
    return this.departmentService.findOne(id);
  }

  @Patch(':id/status')
  @UseGuards(RbacGuard)
  @RequirePermissions('reference.manage')
  @ApiOperation({ summary: 'Update a department status' })
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateDepartmentStatusDto,
  ): Promise<Department> {
    return this.departmentService.updateStatus(id, dto.status);
  }
}
