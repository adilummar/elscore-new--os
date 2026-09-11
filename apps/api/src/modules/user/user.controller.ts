import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser, RequestUser } from '../../common/auth/decorators/current-user.decorator';
import { SkipMustChangePassword } from '../../common/auth/decorators/skip-must-change-password.decorator';
import { PaginationQueryDto } from '../../common/pagination/pagination.dto';
import { RbacGuard } from '../../common/rbac/rbac.guard';
import { RequirePermissions } from '../../common/rbac/require-permissions.decorator';

import { AssignRoleDto } from './dto/assign-role.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { DelegatePermissionDto } from './dto/delegate-permission.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { UserPermissionService } from './user-permission.service';
import { UserRoleService } from './user-role.service';
import { UserService } from './user.service';

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(RbacGuard)
@Controller('users')
export class UserController {
  constructor(
    private readonly userService: UserService,
    private readonly userRoleService: UserRoleService,
    private readonly userPermissionService: UserPermissionService,
  ) {}

  @Get()
  @RequirePermissions('user.read')
  @ApiOperation({ summary: 'List all users' })
  async findAll(@Query() query: PaginationQueryDto) {
    return this.userService.findAll({ limit: query.limit, cursor: query.cursor });
  }

  @Get(':id')
  @RequirePermissions('user.read')
  @ApiOperation({ summary: 'Get user by ID' })
  async findOne(@Param('id') id: string) {
    return this.userService.findOne(id);
  }

  @Post()
  @RequirePermissions('user.create', 'employee.create')
  @ApiOperation({ summary: 'Provision a new user and employee record atomically' })
  async create(@Body() dto: CreateUserDto, @CurrentUser() user: RequestUser) {
    return this.userService.create(dto, user.id);
  }

  @Patch(':id/status')
  @RequirePermissions('user.update')
  @ApiOperation({ summary: 'Update user status (e.g., SUSPENDED)' })
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateUserStatusDto,
    @CurrentUser() user: RequestUser,
  ) {
    await this.userService.updateStatus(id, dto, user.id);
    return { message: 'Status updated' };
  }

  @Post(':id/reset-password')
  @RequirePermissions('user.update')
  @ApiOperation({ summary: 'Admin force reset password' })
  async resetPassword(
    @Param('id') id: string,
    @Body() dto: ResetPasswordDto,
    @CurrentUser() user: RequestUser,
  ) {
    await this.userService.resetPassword(id, dto, user.id);
    return { message: 'Password reset successfully' };
  }

  @Post('me/change-password')
  @SkipMustChangePassword()
  @ApiOperation({ summary: 'Self-service password change' })
  async changePassword(@Body() dto: ChangePasswordDto, @CurrentUser() user: RequestUser) {
    await this.userService.changePassword(user.id, dto);
    return { message: 'Password changed successfully' };
  }

  // --- Role Management ---

  @Post(':id/roles')
  @RequirePermissions('role.assign')
  @ApiOperation({ summary: 'Assign a role to a user' })
  async assignRole(
    @Param('id') id: string,
    @Body() dto: AssignRoleDto,
    @CurrentUser() user: RequestUser,
  ) {
    await this.userRoleService.assignRole(id, dto.roleId, user.id);
    return { message: 'Role assigned' };
  }

  @Delete(':id/roles/:roleId')
  @RequirePermissions('role.assign')
  @ApiOperation({ summary: 'Revoke a role from a user' })
  async revokeRole(
    @Param('id') id: string,
    @Param('roleId') roleId: string,
    @CurrentUser() user: RequestUser,
  ) {
    await this.userRoleService.revokeRole(id, roleId, user.id);
    return { message: 'Role revoked' };
  }

  // --- Delegation Management ---

  @Post(':id/permissions')
  @RequirePermissions('role.manage') // Or another permission, usually HR Manager has role.manage
  @ApiOperation({ summary: 'Delegate a specific HR duty to a user' })
  async delegatePermission(
    @Param('id') id: string,
    @Body() dto: DelegatePermissionDto,
    @CurrentUser() user: RequestUser,
  ) {
    await this.userPermissionService.delegatePermission(id, dto.permissionId, user.id);
    return { message: 'Permission delegated' };
  }

  @Delete(':id/permissions/:grantId')
  @RequirePermissions('role.manage')
  @ApiOperation({ summary: 'Revoke a delegated HR duty' })
  async revokeDelegation(
    @Param('id') id: string,
    @Param('grantId') grantId: string,
    @CurrentUser() user: RequestUser,
  ) {
    await this.userPermissionService.revokeDelegation(id, grantId, user.id);
    return { message: 'Delegation revoked' };
  }
}
