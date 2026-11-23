import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser, RequestUser } from '../../../common/auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../../common/auth/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/rbac/rbac.guard';
import { RequirePermissions } from '../../../common/rbac/require-permissions.decorator';

import { AssignCoordinatorDto, CoordinationQueryDto, HideObservationDto, ObservationDto } from './coordination.dto';
import { COORDINATION_MANAGE, CoordinationService } from './coordination.service';

/**
 * Tutor Management — Tutor Coordination. Coordinators (tutor_coordination.read) see only their
 * currently assigned tutors; the scope is enforced in the service. There is no export here.
 */
@ApiTags('Tutor Coordination')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('tutor-hr/coordination')
export class CoordinationController {
  constructor(private readonly service: CoordinationService) {}

  @Get('dashboard')
  @RequirePermissions('tutor_coordination.read')
  @ApiOperation({ summary: 'Five dashboard metrics; for the Head also a per-coordinator breakdown' })
  dashboard(@Query() q: CoordinationQueryDto, @CurrentUser() user: RequestUser) {
    return this.service.dashboard(q, user.id);
  }

  @Get('tutors')
  @RequirePermissions('tutor_coordination.read')
  tutors(@Query() q: CoordinationQueryDto, @CurrentUser() user: RequestUser) {
    return this.service.listTutors(q, user.id);
  }

  @Get('tutors/:id')
  @RequirePermissions('tutor_coordination.read')
  tutor(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: RequestUser) {
    return this.service.tutorDetail(id, user.id);
  }

  @Post('tutors/:id/observations')
  @RequirePermissions('tutor_coordination.observe')
  @ApiOperation({ summary: 'Record a class observation (read-only for coordinators once saved)' })
  observe(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ObservationDto, @CurrentUser() user: RequestUser) {
    return this.service.createObservation(id, dto, user.id);
  }

  @Get('coordinators')
  @RequirePermissions(COORDINATION_MANAGE)
  coordinators() {
    return this.service.coordinators();
  }

  @Post('assignments')
  @RequirePermissions(COORDINATION_MANAGE)
  @ApiOperation({ summary: 'Assign, reassign or unassign (coordinatorUserId null, reason required) tutors' })
  assign(@Body() dto: AssignCoordinatorDto, @CurrentUser() user: RequestUser) {
    return this.service.assign(dto, user.id);
  }

  @Patch('observations/:id')
  @RequirePermissions(COORDINATION_MANAGE)
  @ApiOperation({ summary: 'Edit an observation (Head only; previous values kept)' })
  edit(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ObservationDto, @CurrentUser() user: RequestUser) {
    return this.service.editObservation(id, dto, user.id);
  }

  @Delete('observations/:id')
  @RequirePermissions(COORDINATION_MANAGE)
  @ApiOperation({ summary: 'Delete (hide) an observation with a reason (Head only; kept in history)' })
  hide(@Param('id', ParseUUIDPipe) id: string, @Body() dto: HideObservationDto, @CurrentUser() user: RequestUser) {
    return this.service.hideObservation(id, dto, user.id);
  }
}
