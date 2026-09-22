import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  ForbiddenException,
  Delete,
} from '@nestjs/common';
import { SalesTargetService } from './sales-target.service';
import { SetSalesTargetDto } from './dto/set-target.dto';
import { RequirePermissions } from '../../common/rbac/require-permissions.decorator';
import { CurrentUser, RequestUser } from '../../common/auth/decorators/current-user.decorator';
import { RbacGuard } from '../../common/rbac/rbac.guard';
import { RbacService } from '../../common/rbac/rbac.service';

@UseGuards(RbacGuard)
@Controller('sales-targets')
export class SalesTargetController {
  constructor(
    private readonly service: SalesTargetService,
    private readonly rbacService: RbacService,
  ) {}

  /**
   * GET /sales-targets/my-progress
   * Counsellor reads own target + progress for a given month.
   * Requires: target.read.own
   */
  @Get('my-progress')
  @RequirePermissions('target.read.own')
  async getMyProgress(
    @CurrentUser() user: RequestUser,
    @Query('month') month: string,
    @Query('year') year: string,
  ) {
    const m = month ? parseInt(month) : new Date().getMonth() + 1;
    const y = year ? parseInt(year) : new Date().getFullYear();
    return this.service.getProgress(user.id, m, y);
  }

  /**
   * GET /sales-targets/all
   * Sales Head / CEO reads all counsellors' targets + progress for a month.
   * Requires: target.read.team
   */
  @Get('all')
  @RequirePermissions('target.read.team')
  async getAllTargets(
    @Query('month') month: string,
    @Query('year') year: string,
  ) {
    const m = month ? parseInt(month) : new Date().getMonth() + 1;
    const y = year ? parseInt(year) : new Date().getFullYear();
    const targets = await this.service.getAllTargets(y, m);

    // Enrich each target with live progress calculation
    const enriched = await Promise.all(
      targets.map(async (t) => {
        const progress = await this.service.getProgress(t.userId, m, y);
        return {
          ...t,
          actual: progress.actual,
          progressRatio: progress.progress,
          required: progress.required,
          numeratorCount: progress.numeratorCount,
          denominatorCount: progress.denominatorCount,
        };
      }),
    );
    return enriched;
  }

  /**
   * GET /sales-targets/counsellor/:userId
   * Sales Head / CEO reads a specific counsellor's full year of targets.
   * Requires: target.read.team
   */
  @Get('counsellor/:userId')
  @RequirePermissions('target.read.team')
  async getCounsellorTargets(
    @Param('userId') targetUserId: string,
    @Query('year') year: string,
  ) {
    const y = year ? parseInt(year) : new Date().getFullYear();
    return this.service.getTargetsForUser(targetUserId, y);
  }

  /**
   * POST /sales-targets
   * Sales Head creates or updates a counsellor's monthly target.
   * Requires: target.manage
   *
   * If a target already exists for that counsellor/month, the previous config
   * is preserved in SalesTargetHistory before being updated.
   */
  @Post()
  @RequirePermissions('target.manage')
  async setTarget(
    @Body() dto: SetSalesTargetDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.setTarget(dto, user.id);
  }

  @Post('team')
  @RequirePermissions('target.manage')
  async setTeamTarget(
    @Body() dto: any,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.setTeamTarget(dto, user.id);
  }

  @Post('team-bundle')
  @RequirePermissions('target.manage')
  async setTeamBundle(
    @Body() dto: any,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.setTeamBundle(dto, user.id);
  }

  @Get('team/:departmentId')
  @RequirePermissions('target.read.team')
  async getTeamTarget(
    @Param('departmentId') departmentId: string,
    @Query('month') month?: string,
    @Query('year') year?: string,
  ) {
    const d = new Date();
    const m = month ? parseInt(month) : d.getMonth() + 1;
    const y = year ? parseInt(year) : d.getFullYear();
    return this.service.getTeamTarget(departmentId, y, m);
  }

  @Delete('team/:departmentId/:year/:month')
  @RequirePermissions('target.manage')
  async deleteTeamTarget(
    @Param('departmentId') departmentId: string,
    @Param('year') year: string,
    @Param('month') month: string,
  ) {
    return this.service.deleteTeamTarget(departmentId, parseInt(year), parseInt(month));
  }

  @Delete(':id')
  @RequirePermissions('target.manage')
  async deleteTarget(@Param('id') id: string) {
    return this.service.deleteTarget(id);
  }

  @Get('reports/mom')
  @RequirePermissions('target.read.team')
  async getMoMPerformance(
    @Query('year') year: string,
    @Query('month') month: string,
  ) {
    const y = year ? parseInt(year) : new Date().getFullYear();
    const m = month ? parseInt(month) : new Date().getMonth() + 1;

    let prevY = y;
    let prevM = m - 1;
    if (prevM === 0) {
      prevM = 12;
      prevY = y - 1;
    }

    const currentTargets = await this.service.getAllTargets(y, m);
    const prevTargets = await this.service.getAllTargets(prevY, prevM);

    const enriched = await Promise.all(
      currentTargets.map(async (t) => {
        const currProgress = await this.service.getProgress(t.userId, m, y);
        const prevTarget = prevTargets.find((pt) => pt.userId === t.userId);
        let prevProgress = null;
        if (prevTarget) {
          prevProgress = await this.service.getProgress(t.userId, prevM, prevY);
        }

        const currActual = currProgress.actual;
        const previousActual = prevProgress ? prevProgress.actual : 0;
        let growthRatio = 0;

        if (previousActual > 0) {
          growthRatio = ((currActual - previousActual) / previousActual) * 100;
        } else if (currActual > 0) {
          growthRatio = 100; // Infinity treated as 100% growth if they had 0 before
        }

        return {
          counsellor: t.user,
          targetValue: t.targetValue,
          targetType: t.targetType,
          currentActual: currActual,
          previousActual: previousActual,
          growthRatio: growthRatio, // positive = increment, negative = decrement
          isMeetingTarget: currProgress.progress >= 1,
          uncompletedAmount: Math.max(0, Number(t.targetValue) - currActual),
        };
      }),
    );

    return enriched;
  }
}
