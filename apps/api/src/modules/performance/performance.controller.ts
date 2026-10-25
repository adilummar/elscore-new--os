import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser, RequestUser } from '../../common/auth/decorators/current-user.decorator';
import { RbacGuard } from '../../common/rbac/rbac.guard';
import { RbacService } from '../../common/rbac/rbac.service';
import { RequirePermissions } from '../../common/rbac/require-permissions.decorator';
import {
  AcknowledgePerformanceReviewDto,
  AmendPerformanceReviewDto,
  CreateEmployeeGoalDto,
  CreatePerformanceCycleDto,
  CreatePerformanceReviewDto,
  CreatePipDto,
  EvaluatePerformanceReviewDto,
  FinalizePerformanceReviewDto,
  QueryCyclesDto,
  QueryGoalsDto,
  QueryPerformanceReviewsDto,
  QueryPipsDto,
  TransitionPipStatusDto,
  UpdateEmployeeGoalDto,
  UpdatePerformanceCycleDto,
  UpdatePipDto,
  UpdatePipObjectiveStatusDto,
  UpdateSelfReviewDto,
} from './dto';
import { PerformanceService } from './performance.service';

@ApiTags('HR Performance Management')
@ApiBearerAuth()
@UseGuards(RbacGuard)
@Controller('performance')
export class PerformanceController {
  constructor(
    private readonly performanceService: PerformanceService,
    private readonly rbacService: RbacService,
  ) {}

  // ===========================================================================
  // DASHBOARD
  // ===========================================================================

  @Get('dashboard')
  @RequirePermissions('performance.read.own')
  @ApiOperation({ summary: 'Get summary metrics and KPIs for performance management' })
  async getDashboard(@CurrentUser() user: RequestUser) {
    const perms = await this.rbacService.getPermissionsForUser(user.id);
    const hasOrgWide = perms.has('performance.read.all');
    const hasTeam = perms.has('performance.read.team');
    return this.performanceService.getDashboardMetrics(user.id, hasOrgWide, hasTeam);
  }

  // ===========================================================================
  // REVIEW CYCLES
  // ===========================================================================

  @Post('cycles')
  @RequirePermissions('performance.cycle.manage')
  @ApiOperation({ summary: 'Create a new performance review cycle' })
  async createCycle(
    @Body() dto: CreatePerformanceCycleDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.performanceService.createCycle(dto, user.id);
  }

  @Patch('cycles/:id')
  @RequirePermissions('performance.cycle.manage')
  @ApiOperation({ summary: 'Update an existing performance review cycle' })
  async updateCycle(
    @Param('id') id: string,
    @Body() dto: UpdatePerformanceCycleDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.performanceService.updateCycle(id, dto, user.id);
  }

  @Get('cycles/:id')
  @RequirePermissions('performance.read.own')
  @ApiOperation({ summary: 'Get details of a performance review cycle' })
  async getCycleById(@Param('id') id: string) {
    return this.performanceService.getCycleById(id);
  }

  @Get('cycles')
  @RequirePermissions('performance.read.own')
  @ApiOperation({ summary: 'List all performance review cycles' })
  async listCycles(@Query() query: QueryCyclesDto) {
    return this.performanceService.listCycles(query);
  }

  // ===========================================================================
  // EMPLOYEE GOALS & OBJECTIVES
  // ===========================================================================

  @Post('goals')
  @RequirePermissions('performance.goal.manage')
  @ApiOperation({ summary: 'Create an employee goal or measurable objective' })
  async createGoal(
    @Body() dto: CreateEmployeeGoalDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.performanceService.createGoal(dto, user.id);
  }

  @Patch('goals/:id')
  @RequirePermissions('performance.goal.manage')
  @ApiOperation({ summary: 'Update an employee goal or record progress/results' })
  async updateGoal(
    @Param('id') id: string,
    @Body() dto: UpdateEmployeeGoalDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.performanceService.updateGoal(id, dto, user.id);
  }

  @Get('goals/:id')
  @RequirePermissions('performance.read.own')
  @ApiOperation({ summary: 'Get details of a goal' })
  async getGoalById(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    const perms = await this.rbacService.getPermissionsForUser(user.id);
    const hasOrgWide = perms.has('performance.read.all');
    const hasTeam = perms.has('performance.read.team') || perms.has('performance.goal.manage');
    return this.performanceService.getGoalById(id, user.id, hasOrgWide, hasTeam);
  }

  @Get('goals')
  @RequirePermissions('performance.read.own')
  @ApiOperation({ summary: 'List employee goals' })
  async listGoals(
    @Query() query: QueryGoalsDto,
    @CurrentUser() user: RequestUser,
  ) {
    const perms = await this.rbacService.getPermissionsForUser(user.id);
    const hasTeamOrAll = perms.has('performance.read.all') || perms.has('performance.read.team') || perms.has('performance.goal.manage');
    return this.performanceService.listGoals(query, user.id, hasTeamOrAll);
  }

  // ===========================================================================
  // PERFORMANCE REVIEWS
  // ===========================================================================

  @Post('reviews')
  @RequirePermissions('performance.review.create')
  @ApiOperation({ summary: 'Initiate a performance review for an employee' })
  async createReview(
    @Body() dto: CreatePerformanceReviewDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.performanceService.createReview(dto, user.id);
  }

  @Get('reviews/:id')
  @RequirePermissions('performance.read.own')
  @ApiOperation({ summary: 'Get detailed performance review record' })
  async getReviewById(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    const perms = await this.rbacService.getPermissionsForUser(user.id);
    const hasOrgWide = perms.has('performance.read.all');
    const hasTeam = perms.has('performance.read.team') || perms.has('performance.review.evaluate');
    return this.performanceService.getReviewById(id, user.id, hasOrgWide, hasTeam);
  }

  @Get('reviews')
  @RequirePermissions('performance.read.own')
  @ApiOperation({ summary: 'List performance reviews with status and cycle filters' })
  async listReviews(
    @Query() query: QueryPerformanceReviewsDto,
    @CurrentUser() user: RequestUser,
  ) {
    const perms = await this.rbacService.getPermissionsForUser(user.id);
    const hasOrgWide = perms.has('performance.read.all');
    const hasTeam = perms.has('performance.read.team');
    return this.performanceService.listReviews(query, user.id, hasOrgWide, hasTeam);
  }

  @Patch('reviews/:id/self-review')
  @RequirePermissions('performance.read.own')
  @ApiOperation({ summary: 'Submit employee self-assessment and feedback comments' })
  async updateSelfReview(
    @Param('id') id: string,
    @Body() dto: UpdateSelfReviewDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.performanceService.updateSelfReview(id, dto, user.id);
  }

  @Patch('reviews/:id/evaluate')
  @RequirePermissions('performance.review.evaluate')
  @ApiOperation({ summary: 'Record manager evaluation feedback, ratings, and confidential notes' })
  async evaluateReview(
    @Param('id') id: string,
    @Body() dto: EvaluatePerformanceReviewDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.performanceService.evaluateReview(id, dto, user.id);
  }

  @Post('reviews/:id/finalize')
  @RequirePermissions('performance.review.finalize')
  @ApiOperation({ summary: 'Finalize and complete a performance review (enforces separation of duties)' })
  async finalizeReview(
    @Param('id') id: string,
    @Body() dto: FinalizePerformanceReviewDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.performanceService.finalizeReview(id, dto, user.id);
  }

  @Post('reviews/:id/acknowledge')
  @RequirePermissions('performance.review.acknowledge')
  @ApiOperation({ summary: 'Employee acknowledges receipt of completed review' })
  async acknowledgeReview(
    @Param('id') id: string,
    @Body() dto: AcknowledgePerformanceReviewDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.performanceService.acknowledgeReview(id, dto, user.id);
  }

  @Post('reviews/:id/amend')
  @RequirePermissions('performance.review.amend')
  @ApiOperation({ summary: 'Amend a completed performance review with mandatory audit record' })
  async amendReview(
    @Param('id') id: string,
    @Body() dto: AmendPerformanceReviewDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.performanceService.amendReview(id, dto, user.id);
  }

  // ===========================================================================
  // PERFORMANCE IMPROVEMENT PLANS (PIPs)
  // ===========================================================================

  @Post('pips')
  @RequirePermissions('performance.pip.manage')
  @ApiOperation({ summary: 'Create a Performance Improvement Plan (PIP) for an employee' })
  async createPip(
    @Body() dto: CreatePipDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.performanceService.createPip(dto, user.id);
  }

  @Patch('pips/:id')
  @RequirePermissions('performance.pip.manage')
  @ApiOperation({ summary: 'Update progress updates or check-in dates for a PIP' })
  async updatePip(
    @Param('id') id: string,
    @Body() dto: UpdatePipDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.performanceService.updatePip(id, dto, user.id);
  }

  @Post('pips/:id/transition')
  @RequirePermissions('performance.pip.manage')
  @ApiOperation({ summary: 'Transition PIP lifecycle status (Active, Monitoring, Achieved, Closed)' })
  async transitionPipStatus(
    @Param('id') id: string,
    @Body() dto: TransitionPipStatusDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.performanceService.transitionPipStatus(id, dto, user.id);
  }

  @Patch('pips/:id/objectives/:objectiveId/status')
  @RequirePermissions('performance.pip.manage')
  @ApiOperation({ summary: 'Update status of a specific objective within a PIP' })
  async updatePipObjectiveStatus(
    @Param('id') id: string,
    @Param('objectiveId') objectiveId: string,
    @Body() dto: UpdatePipObjectiveStatusDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.performanceService.updatePipObjectiveStatus(id, objectiveId, dto.status, user.id);
  }

  @Get('pips/:id')
  @RequirePermissions('performance.read.own')
  @ApiOperation({ summary: 'Get details of a PIP' })
  async getPipById(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    const perms = await this.rbacService.getPermissionsForUser(user.id);
    const hasOrgWide = perms.has('performance.read.all');
    const hasTeam = perms.has('performance.read.team') || perms.has('performance.pip.manage');
    return this.performanceService.getPipById(id, user.id, hasOrgWide, hasTeam);
  }

  @Get('pips')
  @RequirePermissions('performance.read.own')
  @ApiOperation({ summary: 'List Performance Improvement Plans' })
  async listPips(
    @Query() query: QueryPipsDto,
    @CurrentUser() user: RequestUser,
  ) {
    const perms = await this.rbacService.getPermissionsForUser(user.id);
    const hasTeamOrAll = perms.has('performance.read.all') || perms.has('performance.read.team') || perms.has('performance.pip.manage');
    return this.performanceService.listPips(query, user.id, hasTeamOrAll);
  }
}
