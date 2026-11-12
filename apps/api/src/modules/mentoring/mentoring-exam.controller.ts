import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';

import { CurrentUser, RequestUser } from '../../common/auth/decorators/current-user.decorator';
import { RbacGuard } from '../../common/rbac/rbac.guard';
import { RequirePermissions } from '../../common/rbac/require-permissions.decorator';

import { MentoringAccessService } from './mentoring-access.service';
import { MentoringExamService } from './mentoring-exam.service';
import { ExamDueQueryDto, ExamQueryDto, ExamWorkspaceQueryDto } from './mentoring.dto';

type Body_ = Record<string, unknown>;

/**
 * Weekly exams, for the assigned Mentor. Reading is scoped in the database query to the students the caller may see. Every
 * change needs the Mentor work permission AND is checked again in the service against the student's assigned Mentor.
 */
@UseGuards(RbacGuard)
@Controller('mentoring')
export class MentoringExamController {
  constructor(
    private readonly exams: MentoringExamService,
    private readonly access: MentoringAccessService,
  ) {}

  @Get('students/:activationId/exams')
  async list(@Param('activationId') activationId: string, @Query() query: ExamQueryDto, @CurrentUser() user: RequestUser) {
    return this.exams.list(activationId, query, await this.access.scopeFor(user.id));
  }

  @Post('students/:activationId/exams')
  @RequirePermissions('mentoring.stage.work')
  create(@Param('activationId') activationId: string, @Body() body: Body_, @CurrentUser() user: RequestUser) {
    return this.exams.create(activationId, body, user.id);
  }

  /** The Exams workspace: exams across the caller's students. Declared before ':examId' so the word is never read as an id. */
  @Get('exams')
  async workspace(@Query() query: ExamWorkspaceQueryDto, @CurrentUser() user: RequestUser) {
    return this.exams.workspace(await this.access.scopeFor(user.id), query);
  }

  /** Which student and subject need an exam next, from verified class hours. Read-only. */
  @Get('exams/due')
  async due(@Query() query: ExamDueQueryDto, @CurrentUser() user: RequestUser) {
    return this.exams.due(await this.access.scopeFor(user.id), query);
  }

  @Get('exams/:examId')
  async detail(@Param('examId') examId: string, @CurrentUser() user: RequestUser) {
    return this.exams.detail(examId, await this.access.scopeFor(user.id));
  }

  @Put('exams/:examId')
  @RequirePermissions('mentoring.stage.work')
  update(@Param('examId') examId: string, @Body() body: Body_, @CurrentUser() user: RequestUser) {
    return this.exams.update(examId, body, user.id);
  }

  @Post('exams/:examId/reschedule')
  @RequirePermissions('mentoring.stage.work')
  reschedule(@Param('examId') examId: string, @Body() body: Body_, @CurrentUser() user: RequestUser) {
    return this.exams.reschedule(examId, body, user.id);
  }

  @Post('exams/:examId/remind')
  @RequirePermissions('mentoring.stage.work')
  remind(@Param('examId') examId: string, @CurrentUser() user: RequestUser) {
    return this.exams.sendReminder(examId, user.id);
  }

  @Post('exams/:examId/informed')
  @RequirePermissions('mentoring.stage.work')
  informed(@Param('examId') examId: string, @Body() body: Body_, @CurrentUser() user: RequestUser) {
    return this.exams.markInformed(examId, body.note, user.id);
  }

  @Post('exams/:examId/conducted')
  @RequirePermissions('mentoring.stage.work')
  conducted(@Param('examId') examId: string, @Body() body: Body_, @CurrentUser() user: RequestUser) {
    return this.exams.recordConducted(examId, body, user.id);
  }

  @Put('exams/:examId/items/:kind')
  @RequirePermissions('mentoring.stage.work')
  item(@Param('examId') examId: string, @Param('kind') kind: string, @Body() body: Body_, @CurrentUser() user: RequestUser) {
    return this.exams.updateItem(examId, kind, body, user.id);
  }

  @Put('exams/:examId/marks')
  @RequirePermissions('mentoring.stage.work')
  marks(@Param('examId') examId: string, @Body() body: Body_, @CurrentUser() user: RequestUser) {
    return this.exams.recordMarks(examId, body, user.id);
  }

  @Put('exams/:examId/remarks')
  @RequirePermissions('mentoring.stage.work')
  remarks(@Param('examId') examId: string, @Body() body: Body_, @CurrentUser() user: RequestUser) {
    return this.exams.recordRemarks(examId, body, user.id);
  }

  @Post('exams/:examId/re-exam')
  @RequirePermissions('mentoring.stage.work')
  reExam(@Param('examId') examId: string, @Body() body: Body_, @CurrentUser() user: RequestUser) {
    return this.exams.setReExam(examId, body, user.id);
  }

  @Post('exams/:examId/re-exam/schedule')
  @RequirePermissions('mentoring.stage.work')
  scheduleReExam(@Param('examId') examId: string, @Body() body: Body_, @CurrentUser() user: RequestUser) {
    return this.exams.scheduleReExam(examId, body, user.id);
  }
}

/**
 * The tutor's own exams. No route takes a tutor id: every answer starts from the signed-in user, so a tutor cannot reach
 * another tutor's exams, and the Mentor's remarks are never in the answer.
 */
@UseGuards(RbacGuard)
@Controller('tutor-portal/exams')
export class TutorExamsController {
  constructor(private readonly exams: MentoringExamService) {}

  @Get()
  @RequirePermissions('tutor.portal.read')
  mine(@Query('from') from: string | undefined, @Query('to') to: string | undefined, @CurrentUser() user: RequestUser) {
    return this.exams.tutorExams(user.id, { from, to });
  }

  @Post(':examId/receipt')
  @RequirePermissions('tutor.portal.read')
  receipt(@Param('examId') examId: string, @Body() body: Body_, @CurrentUser() user: RequestUser) {
    return this.exams.tutorConfirmReceipt(examId, body, user.id);
  }

  @Put(':examId/evaluation')
  @RequirePermissions('tutor.portal.read')
  evaluation(@Param('examId') examId: string, @Body() body: Body_, @CurrentUser() user: RequestUser) {
    return this.exams.tutorEvaluate(examId, body, user.id);
  }
}
