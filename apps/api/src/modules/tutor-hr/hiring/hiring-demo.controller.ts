import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser, RequestUser } from '../../../common/auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../../common/auth/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/rbac/rbac.guard';
import { RequirePermissions } from '../../../common/rbac/require-permissions.decorator';

import {
  BookDemoDto,
  CreateAdSpendDto,
  DemoAttendanceDto,
  ReassignDemoDto,
  ReportQueryDto,
  RescheduleDemoDto,
  SetScheduleDto,
  SubmitEvaluationDto,
  WorkloadQueryDto,
} from './hiring-demo.dto';
import { HiringDemoService } from './hiring-demo.service';
import { HiringEscalationService } from './hiring-escalation.service';
import { HiringEvaluationService } from './hiring-evaluation.service';
import { HiringReportService } from './hiring-report.service';
import { HiringScheduleService } from './hiring-schedule.service';

/** Demos, evaluations, workload, SLA configuration, dashboard and reports for Tutor Hiring. */
@ApiTags('Tutor Hiring')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('tutor-hr/hiring')
export class HiringDemoController {
  constructor(
    private readonly demos: HiringDemoService,
    private readonly evaluations: HiringEvaluationService,
    private readonly reports: HiringReportService,
    private readonly schedules: HiringScheduleService,
    private readonly escalations: HiringEscalationService,
  ) {}

  // ── Overdue-evaluation notifications (context for the notification bell) ──
  @Get('notifications/overdue-evaluations')
  @RequirePermissions('tutor_lead.read')
  @ApiOperation({ summary: "The caller's own overdue-evaluation escalations. Tutor Head receives all; a manager receives their own." })
  overdueNotifications(@CurrentUser() user: RequestUser) {
    return this.escalations.listForUser(user.id);
  }

  // ── Demos ──
  @Post('candidates/:id/demos')
  @RequirePermissions('tutor_lead.update')
  @ApiOperation({ summary: 'Book a demo/interview and assign it to a staff member' })
  book(@Param('id', ParseUUIDPipe) id: string, @Body() dto: BookDemoDto, @CurrentUser() user: RequestUser) {
    return this.demos.book(id, dto, user.id);
  }

  @Get('candidates/:id/demos')
  @RequirePermissions('tutor_lead.read')
  @ApiOperation({ summary: 'Demo history for a candidate, including reschedules, reassignments and evaluation' })
  listForCandidate(@Param('id', ParseUUIDPipe) id: string) {
    return this.demos.listForCandidate(id);
  }

  @Get('demos/workload')
  @RequirePermissions('tutor_lead.read')
  @ApiOperation({ summary: 'Demo workload for a date range. Own workload, or department-wide for tutor_hiring.read-all.' })
  workload(@Query() q: WorkloadQueryDto, @CurrentUser() user: RequestUser) {
    return this.demos.workload(q, user.id);
  }

  @Get('demos/pending-evaluations')
  @RequirePermissions('tutor_lead.read')
  pending(@CurrentUser() user: RequestUser) {
    return this.demos.pendingEvaluations(user.id);
  }

  @Get('staff')
  @RequirePermissions('tutor_lead.read')
  @ApiOperation({ summary: 'Staff who can be assigned demos' })
  staff() {
    return this.demos.assignableStaff();
  }

  @Post('demos/:id/reschedule')
  @RequirePermissions('tutor_lead.update')
  reschedule(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RescheduleDemoDto, @CurrentUser() user: RequestUser) {
    return this.demos.reschedule(id, dto, user.id);
  }

  @Post('demos/:id/reassign')
  // tutor_lead.update lets the person who booked the demo reach the service; the service then allows only that
  // person or a holder of tutor_hiring.reassign.
  @RequirePermissions('tutor_lead.update')
  @ApiOperation({ summary: 'Reassign a booked demo. Only its booker or a holder of tutor_hiring.reassign.' })
  reassign(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReassignDemoDto, @CurrentUser() user: RequestUser) {
    return this.demos.reassign(id, dto, user.id);
  }

  @Post('demos/:id/attendance')
  @RequirePermissions('tutor_lead.update')
  attendance(@Param('id', ParseUUIDPipe) id: string, @Body() dto: DemoAttendanceDto, @CurrentUser() user: RequestUser) {
    return this.demos.recordAttendance(id, dto, user.id);
  }

  // ── Evaluation ──
  @Get('salary-slabs')
  @RequirePermissions('tutor_lead.read')
  @ApiOperation({ summary: 'Slabs for the evaluation form. Rates only for HR and for a conductor with an evaluation waiting.' })
  slabs(@CurrentUser() user: RequestUser) {
    return this.evaluations.listSlabs(user.id);
  }

  @Post('demos/:id/evaluation')
  @RequirePermissions('tutor_lead.update')
  @ApiOperation({ summary: 'Submit the evaluation (only by the staff member who conducted the demo)' })
  evaluate(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SubmitEvaluationDto, @CurrentUser() user: RequestUser) {
    return this.evaluations.submit(id, dto, user.id);
  }

  // ── Working-hours schedule ──
  @Get('schedule')
  @RequirePermissions('tutor_lead.read')
  async schedule() {
    return { current: await this.schedules.getEffective(), history: await this.schedules.list() };
  }

  @Post('schedule')
  @RequirePermissions('tutor_hiring.settings')
  setSchedule(@Body() dto: SetScheduleDto, @CurrentUser() user: RequestUser) {
    return this.schedules.set(dto, user.id);
  }

  // ── Dashboard & reports ──
  @Get('dashboard')
  @RequirePermissions('tutor_lead.read')
  dashboard(@CurrentUser() user: RequestUser) {
    return this.reports.dashboard(user.id);
  }

  @Get('reports/summary')
  @RequirePermissions('tutor_hiring.report')
  summary(@Query() q: ReportQueryDto) {
    return this.reports.summary(q);
  }

  @Post('reports/ad-spend')
  @RequirePermissions('tutor_hiring.settings')
  @ApiOperation({ summary: 'Record advertising spend for a source and period (manual entry only)' })
  addAdSpend(@Body() dto: CreateAdSpendDto, @CurrentUser() user: RequestUser) {
    return this.reports.addAdSpend(dto, user.id);
  }
}
