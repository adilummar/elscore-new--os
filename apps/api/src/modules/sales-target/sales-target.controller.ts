import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  ForbiddenException,
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
    // Safety: a Sales Head cannot set a target for themselves (they are not a counsellor)
    // but we do not enforce this at backend since it could be a legitimate future use case.
    return this.service.setTarget(dto, user.id);
  }
}
