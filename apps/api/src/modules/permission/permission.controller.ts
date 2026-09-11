import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { PaginationQueryDto } from '../../common/pagination/pagination.dto';
import { RbacGuard } from '../../common/rbac/rbac.guard';
import { RequirePermissions } from '../../common/rbac/require-permissions.decorator';

import { PermissionService } from './permission.service';

@ApiTags('Permissions')
@ApiBearerAuth()
@UseGuards(RbacGuard)
@Controller('permissions')
export class PermissionController {
  constructor(private readonly permissionService: PermissionService) {}

  @Get()
  @RequirePermissions('role.manage') // Or another permission? Let's assume role.manage can view permissions
  @ApiOperation({ summary: 'List all permissions' })
  async findAll(@Query() query: PaginationQueryDto) {
    return this.permissionService.findAll({ limit: query.limit, cursor: query.cursor });
  }

  @Get(':id')
  @RequirePermissions('role.manage')
  @ApiOperation({ summary: 'Get permission by ID' })
  async findOne(@Param('id') id: string) {
    return this.permissionService.findOne(id);
  }
}
