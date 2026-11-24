import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser, RequestUser } from '../../../common/auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../../common/auth/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/rbac/rbac.guard';
import { RequirePermissions } from '../../../common/rbac/require-permissions.decorator';

import { PAY_SLAB_ASSIGN, TUTOR_SALARY_VIEW } from './pay-slab.constants';
import { TutorSlabAssignmentService } from './tutor-slab-assignment.service';
import { AssignTutorSlabDto, CancelSlabChangeDto } from './tutor-slab.dto';

/**
 * The tutor's Salary tab and slab assignment (HR Head and HR Staff only). There is no edit or delete: a change is a
 * new row from next month, and a cancel keeps the row. Every path has a fixed suffix after ":id", so none of these
 * can capture the profile routes of TutorsController.
 */
@ApiTags('Tutor HR Pay Slabs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('tutor-hr/tutors/:id')
export class TutorSalaryController {
  constructor(private readonly service: TutorSlabAssignmentService) {}

  @Get('salary')
  @RequirePermissions(TUTOR_SALARY_VIEW)
  @ApiOperation({ summary: 'Salary tab: slab for this month, a waiting change, and the full history' })
  salary(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getSalary(id);
  }

  @Post('slab-assignments')
  @RequirePermissions(PAY_SLAB_ASSIGN)
  @ApiOperation({
    summary:
      'Give the tutor a slab: this month if they have none, otherwise a change from next month. Reason required.',
  })
  assign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignTutorSlabDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.assign(id, dto, user.id);
  }

  @Post('slab-assignments/:assignmentId/cancel')
  @RequirePermissions(PAY_SLAB_ASSIGN)
  @ApiOperation({
    summary: 'Cancel a slab change before its month starts. The row is kept, marked cancelled.',
  })
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
    @Body() dto: CancelSlabChangeDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.cancel(id, assignmentId, dto, user.id);
  }
}
