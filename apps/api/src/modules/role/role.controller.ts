import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';


import { CurrentUser, RequestUser } from '../../common/auth/decorators/current-user.decorator';
import { PaginationQueryDto } from '../../common/pagination/pagination.dto';
import { RbacGuard } from '../../common/rbac/rbac.guard';
import { RequirePermissions } from '../../common/rbac/require-permissions.decorator';

import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRolePermissionsDto } from './dto/update-role-permissions.dto';
import { RoleService } from './role.service';

@ApiTags('Roles')
@ApiBearerAuth()
@UseGuards(RbacGuard)
@Controller('roles')
export class RoleController {
  constructor(private readonly roleService: RoleService) {}

  @Get()
  @RequirePermissions('role.read')
  @ApiOperation({ summary: 'List all roles' })
  async findAll(@Query() query: PaginationQueryDto) {
    return this.roleService.findAll({ limit: query.limit, cursor: query.cursor });
  }

  @Get(':id')
  @RequirePermissions('role.read')
  @ApiOperation({ summary: 'Get role by ID' })
  async findOne(@Param('id') id: string) {
    return this.roleService.findOne(id);
  }

  @Post()
  @RequirePermissions('role.manage')
  @ApiOperation({ summary: 'Create a custom role' })
  async createCustomRole(@Body() dto: CreateRoleDto, @CurrentUser() user: RequestUser) {
    return this.roleService.createCustomRole(dto, user.id);
  }

  @Patch(':id/permissions')
  @RequirePermissions('role.manage')
  @ApiOperation({ summary: 'Update permissions for a role' })
  async updateRolePermissions(
    @Param('id') id: string,
    @Body() dto: UpdateRolePermissionsDto,
    @CurrentUser() user: RequestUser,
  ) {
    await this.roleService.updateRolePermission(id, dto.action, dto.permissionId, user.id);
    return { message: 'Role permissions updated successfully' };
  }
}
