import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';

import { CurrentUser, RequestUser } from '../../common/auth/decorators/current-user.decorator';
import { RbacGuard } from '../../common/rbac/rbac.guard';
import { RequirePermissions } from '../../common/rbac/require-permissions.decorator';

import { MentoringAccessService } from './mentoring-access.service';
import { MentoringClassService } from './mentoring-class.service';
import { ClassQueryDto } from './mentoring.dto';

type Body_ = Record<string, unknown>;
/** The class key from a request body. Anything that is not text is empty, and the service refuses it. */
const keyOf = (body: Body_) => (typeof body.key === 'string' ? body.key : '');

/**
 * Daily classes, for the assigned Mentor. Reading is scoped in the database query to the students the caller may see. Every
 * change needs the Mentor work permission AND is checked again in the service against the student's assigned Mentor.
 */
@UseGuards(RbacGuard)
@Controller('mentoring')
export class MentoringClassController {
  constructor(
    private readonly classes: MentoringClassService,
    private readonly access: MentoringAccessService,
  ) {}

  /** One student's classes for a date, from their tutor assignments. Filters run on the server. */
  @Get('students/:activationId/classes')
  async daily(@Param('activationId') activationId: string, @Query() query: ClassQueryDto, @CurrentUser() user: RequestUser) {
    return this.classes.daily(activationId, query.date ?? '', query, await this.access.scopeFor(user.id));
  }

  /** Classes waiting for the Mentor, across their students (or any status, subject, tutor and dates, by filter). */
  @Get('operations/classes')
  async queue(@Query() query: ClassQueryDto, @CurrentUser() user: RequestUser) {
    return this.classes.queue(await this.access.scopeFor(user.id), query);
  }

  @Post('classes/remind/prepare')
  @RequirePermissions('mentoring.stage.work')
  prepareReminder(@Body() body: Body_, @CurrentUser() user: RequestUser) {
    return this.classes.prepareReminder(keyOf(body), user.id);
  }

  @Post('classes/remind/send')
  @RequirePermissions('mentoring.stage.work')
  sendReminder(@Body() body: Body_, @CurrentUser() user: RequestUser) {
    return this.classes.sendReminder(keyOf(body), user.id);
  }

  @Post('classes/reschedule')
  @RequirePermissions('mentoring.stage.work')
  reschedule(@Body() body: Body_, @CurrentUser() user: RequestUser) {
    return this.classes.reschedule(keyOf(body), body, user.id);
  }

  @Get('classes/:sessionId')
  async detail(@Param('sessionId') sessionId: string, @CurrentUser() user: RequestUser) {
    return this.classes.detail(sessionId, await this.access.scopeFor(user.id));
  }

  @Put('classes/:sessionId/notes')
  @RequirePermissions('mentoring.stage.work')
  notes(@Param('sessionId') sessionId: string, @Body() body: Body_, @CurrentUser() user: RequestUser) {
    return this.classes.mentorNotes(sessionId, body, user.id);
  }

  @Post('classes/:sessionId/verify')
  @RequirePermissions('mentoring.stage.work')
  verify(@Param('sessionId') sessionId: string, @Body() body: Body_, @CurrentUser() user: RequestUser) {
    return this.classes.verify(sessionId, body, user.id);
  }

  @Post('classes/:sessionId/return')
  @RequirePermissions('mentoring.stage.work')
  returnToTutor(@Param('sessionId') sessionId: string, @Body() body: Body_, @CurrentUser() user: RequestUser) {
    return this.classes.returnToTutor(sessionId, body.reason, body.kind === 'INCOMPLETE' ? 'INCOMPLETE' : 'CORRECTION', user.id);
  }

  /** The Mentoring Head returns an update for correction, with a reason. Needs the correction permission, which no role holds until it is granted. */
  @Post('classes/:sessionId/head-return')
  @RequirePermissions('mentoring.record.correct')
  async headReturn(@Param('sessionId') sessionId: string, @Body() body: Body_, @CurrentUser() user: RequestUser) {
    return this.classes.returnToTutorAsHead(sessionId, body.reason, body.kind === 'INCOMPLETE' ? 'INCOMPLETE' : 'CORRECTION', await this.access.scopeFor(user.id));
  }

  @Post('classes/:sessionId/adjust')
  @RequirePermissions('mentoring.stage.work')
  adjust(@Param('sessionId') sessionId: string, @Body() body: Body_, @CurrentUser() user: RequestUser) {
    return this.classes.adjustVerified(sessionId, body, user.id);
  }
}
