import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';

import { CurrentUser, RequestUser } from '../../common/auth/decorators/current-user.decorator';
import { RbacGuard } from '../../common/rbac/rbac.guard';
import { RbacService } from '../../common/rbac/rbac.service';
import { RequirePermissions } from '../../common/rbac/require-permissions.decorator';

import { CreateRequirementDto } from './dto/create-requirement.dto';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateRequirementDto } from './dto/update-requirement.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { StudentService } from './student.service';

@UseGuards(RbacGuard)
@Controller()
export class StudentController {
  constructor(
    private readonly studentService: StudentService,
    private readonly rbacService: RbacService,
  ) {}

  private async hasReadAll(userId: string): Promise<boolean> {
    const perms = await this.rbacService.getPermissionsForUser(userId);
    return perms.has('lead.read-all');
  }

  @Post('students')
  @RequirePermissions('student.create')
  async create(@Body() dto: CreateStudentDto, @CurrentUser() user: RequestUser) {
    const readAll = await this.hasReadAll(user.id);
    return this.studentService.create(dto, user.id, readAll);
  }

  @Get('students/:id')
  @RequirePermissions('student.read')
  async findOne(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    const readAll = await this.hasReadAll(user.id);
    return this.studentService.findOne(id, user.id, readAll);
  }

  @Patch('students/:id')
  @RequirePermissions('student.update')
  async update(@Param('id') id: string, @Body() dto: UpdateStudentDto, @CurrentUser() user: RequestUser) {
    const readAll = await this.hasReadAll(user.id);
    return this.studentService.update(id, dto, user.id, readAll);
  }

  @Post('students/:id/requirements')
  @RequirePermissions('requirement.create')
  async createRequirement(@Param('id') id: string, @Body() dto: CreateRequirementDto, @CurrentUser() user: RequestUser) {
    const readAll = await this.hasReadAll(user.id);
    return this.studentService.createRequirement(id, dto, user.id, readAll);
  }

  @Patch('requirements/:id')
  @RequirePermissions('requirement.update')
  async updateRequirement(@Param('id') id: string, @Body() dto: UpdateRequirementDto, @CurrentUser() user: RequestUser) {
    const readAll = await this.hasReadAll(user.id);
    return this.studentService.updateRequirement(id, dto, user.id, readAll);
  }

  @Post('students/bundle')
  @RequirePermissions('student.create')
  async saveBundle(@Body() dto: any, @CurrentUser() user: RequestUser) {
    const readAll = await this.hasReadAll(user.id);
    const { leadId, studentId, ...data } = dto;
    return this.studentService.saveBundle(leadId, studentId || null, data, user.id, readAll);
  }
}
