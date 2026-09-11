import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser, RequestUser } from '../../common/auth/decorators/current-user.decorator';
import { PaginationQueryDto } from '../../common/pagination/pagination.dto';
import { RbacGuard } from '../../common/rbac/rbac.guard';
import { RequirePermissions } from '../../common/rbac/require-permissions.decorator';

import { UpdateEmployeeStatusDto } from './dto/update-employee-status.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { EmployeeService } from './employee.service';

@ApiTags('Employees')
@ApiBearerAuth()
@UseGuards(RbacGuard)
@Controller('employees')
export class EmployeeController {
  constructor(private readonly employeeService: EmployeeService) {}

  @Get()
  @RequirePermissions('employee.read')
  @ApiOperation({ summary: 'List all employees' })
  async findAll(@Query() query: PaginationQueryDto) {
    return this.employeeService.findAll({ limit: query.limit, cursor: query.cursor });
  }

  @Get(':id')
  @RequirePermissions('employee.read')
  @ApiOperation({ summary: 'Get employee by ID' })
  async findOne(@Param('id') id: string) {
    return this.employeeService.findOne(id);
  }

  @Patch(':id')
  @RequirePermissions('employee.update')
  @ApiOperation({ summary: 'Update employee profile' })
  async updateProfile(
    @Param('id') id: string,
    @Body() dto: UpdateEmployeeDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.employeeService.updateProfile(id, dto, user.id);
  }

  @Patch(':id/status')
  @RequirePermissions('employee.update')
  @ApiOperation({ summary: 'Update employee status (including termination)' })
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateEmployeeStatusDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.employeeService.updateStatus(id, dto, user.id);
  }
}
