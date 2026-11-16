import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';

import { CurrentUser, RequestUser } from '../../common/auth/decorators/current-user.decorator';
import { RbacGuard } from '../../common/rbac/rbac.guard';

import { MentoringAccessService } from './mentoring-access.service';
import { MentoringStudentHubService } from './mentoring-student-hub.service';
import { StudentHubClassesQueryDto, StudentHubListQueryDto } from './mentoring.dto';

/**
 * The Mentor Portal Students list and Student Workspace. Read only. Every route is scoped in the database query by the access service:
 * a Mentor receives only their own students, the Head and the CEO the department, and anyone without Mentoring access receives nothing.
 * Class verification is not here: the workspace calls the existing class endpoints, which keep their own permission and assignment checks.
 */
@UseGuards(RbacGuard)
@Controller('mentoring/mentor-students')
export class MentoringStudentHubController {
  constructor(
    private readonly hub: MentoringStudentHubService,
    private readonly access: MentoringAccessService,
  ) {}

  @Get()
  async list(@Query() q: StudentHubListQueryDto, @CurrentUser() user: RequestUser) {
    return this.hub.list(await this.access.scopeFor(user.id), q);
  }

  @Get(':activationId/workspace')
  async workspace(@Param('activationId') id: string, @CurrentUser() user: RequestUser) {
    return this.hub.workspace(id, await this.access.scopeFor(user.id));
  }

  @Get(':activationId/classes')
  async classes(@Param('activationId') id: string, @Query() q: StudentHubClassesQueryDto, @CurrentUser() user: RequestUser) {
    return this.hub.studentClasses(id, await this.access.scopeFor(user.id), q);
  }

  /** The profile fields with their current values and sources, for the edit form. */
  @Get(':activationId/profile')
  async profile(@Param('activationId') id: string, @CurrentUser() user: RequestUser) {
    return this.hub.profile(id, await this.access.scopeFor(user.id));
  }

  @Get(':activationId/communication')
  async communication(@Param('activationId') id: string, @CurrentUser() user: RequestUser) {
    return this.hub.communication(id, await this.access.scopeFor(user.id));
  }
}
