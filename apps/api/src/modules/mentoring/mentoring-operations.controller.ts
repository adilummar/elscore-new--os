import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';

import { CurrentUser, RequestUser } from '../../common/auth/decorators/current-user.decorator';
import { RbacGuard } from '../../common/rbac/rbac.guard';

import { MentoringAccessService } from './mentoring-access.service';
import { MentoringReminderService } from './mentoring-reminder.service';
import { MentoringSlaService } from './mentoring-sla.service';
import { SlaQueryDto } from './mentoring.dto';

/**
 * Day-to-day Mentoring operations that cut across students. The response-time list is scoped in the database query to the
 * students the caller may see. Reminders are only ever the caller's own.
 */
@UseGuards(RbacGuard)
@Controller('mentoring/operations')
export class MentoringOperationsController {
  constructor(
    private readonly sla: MentoringSlaService,
    private readonly reminders: MentoringReminderService,
    private readonly access: MentoringAccessService,
  ) {}

  /** Work with a response target, filtered on the server: by status, state, kind, student, person and dates. */
  @Get('sla')
  async slaList(@Query() query: SlaQueryDto, @CurrentUser() user: RequestUser) {
    return this.sla.list(await this.access.scopeFor(user.id), query);
  }

  /** Reminders sent to the signed-in person. */
  @Get('reminders/mine')
  myReminders(@CurrentUser() user: RequestUser) {
    return this.reminders.mine(user.id);
  }

  /** The signed-in person confirms they have seen a reminder sent to them. */
  @Post('reminders/:reminderId/acknowledge')
  acknowledgeReminder(@Param('reminderId') reminderId: string, @CurrentUser() user: RequestUser) {
    return this.reminders.acknowledge(reminderId, user.id);
  }
}
