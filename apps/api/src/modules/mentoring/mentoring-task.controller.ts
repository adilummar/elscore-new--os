import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';

import { CurrentUser, RequestUser } from '../../common/auth/decorators/current-user.decorator';
import { RbacGuard } from '../../common/rbac/rbac.guard';
import { RequirePermissions } from '../../common/rbac/require-permissions.decorator';

import { MentoringAccessService } from './mentoring-access.service';
import { MentoringTaskService } from './mentoring-task.service';
import {
  CreateTaskDto,
  TaskCollectDto,
  TaskCommentDto,
  TaskListQueryDto,
  TaskReasonDto,
  TaskSubmitDto,
} from './mentoring.dto';

@UseGuards(RbacGuard)
@Controller('mentoring/tasks')
export class MentoringTaskController {
  constructor(
    private readonly tasks: MentoringTaskService,
    private readonly access: MentoringAccessService,
  ) {}

  @Post()
  @RequirePermissions('mentoring.task.create')
  async create(@Body() dto: CreateTaskDto, @CurrentUser() user: RequestUser) {
    return this.tasks.create(dto, await this.access.scopeFor(user.id));
  }

  @Get()
  async list(@Query() query: TaskListQueryDto, @CurrentUser() user: RequestUser) {
    const scope = await this.access.scopeFor(user.id);
    this.access.requireAnyScope(scope);
    return this.tasks.list(scope, query);
  }

  // ── Counselor actions ──────────────────────────────────────────────────────

  @Post(':id/start')
  @RequirePermissions('mentoring.task.work')
  start(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.tasks.start(id, user.id);
  }

  @Post(':id/collect')
  @RequirePermissions('mentoring.task.work')
  collect(@Param('id') id: string, @Body() dto: TaskCollectDto, @CurrentUser() user: RequestUser) {
    return this.tasks.collect(id, dto, user.id);
  }

  @Post(':id/submit')
  @RequirePermissions('mentoring.task.work')
  submit(@Param('id') id: string, @Body() dto: TaskSubmitDto, @CurrentUser() user: RequestUser) {
    return this.tasks.submit(id, dto, user.id);
  }

  @Post(':id/hold')
  @RequirePermissions('mentoring.task.work')
  hold(@Param('id') id: string, @Body() dto: TaskReasonDto, @CurrentUser() user: RequestUser) {
    return this.tasks.hold(id, dto.reason, user.id);
  }

  @Post(':id/resume')
  @RequirePermissions('mentoring.task.work')
  resume(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.tasks.resumeTask(id, user.id);
  }

  // ── Comments (assignee, assigned Mentor or Head; checked in the service) ──

  @Post(':id/comments')
  async comment(@Param('id') id: string, @Body() dto: TaskCommentDto, @CurrentUser() user: RequestUser) {
    const scope = await this.access.scopeFor(user.id);
    this.access.requireAnyScope(scope);
    return this.tasks.comment(id, dto.body, scope);
  }

  // ── Mentor / Head actions ──────────────────────────────────────────────────

  @Post(':id/verify')
  @RequirePermissions('mentoring.task.verify')
  async verify(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.tasks.verify(id, await this.access.scopeFor(user.id));
  }

  @Post(':id/return')
  @RequirePermissions('mentoring.task.verify')
  async returnTask(@Param('id') id: string, @Body() dto: TaskReasonDto, @CurrentUser() user: RequestUser) {
    return this.tasks.returnTask(id, dto.reason, await this.access.scopeFor(user.id));
  }

  @Post(':id/cancel')
  @RequirePermissions('mentoring.task.create')
  async cancel(@Param('id') id: string, @Body() dto: TaskReasonDto, @CurrentUser() user: RequestUser) {
    return this.tasks.cancel(id, dto.reason, await this.access.scopeFor(user.id));
  }
}
