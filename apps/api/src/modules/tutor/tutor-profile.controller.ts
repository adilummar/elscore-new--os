import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser, RequestUser } from '../../common/auth/decorators/current-user.decorator';
import { RbacGuard } from '../../common/rbac/rbac.guard';
import { RequirePermissions } from '../../common/rbac/require-permissions.decorator';

import { UpdateTeachingExperienceDto, UpdateTutorProfileDto } from './dto/tutor-profile.dto';
import { TutorProfileService } from './tutor-profile.service';

@ApiTags('Tutor Profiles')
@ApiBearerAuth()
@UseGuards(RbacGuard)
@Controller('tutors/profile')
export class TutorProfileController {
  constructor(private readonly tutorProfileService: TutorProfileService) {}

  @Get('me')
  @RequirePermissions('tutor.self.update') // Tutors have this
  @ApiOperation({ summary: 'Get own tutor profile' })
  async getMyProfile(@CurrentUser() user: RequestUser) {
    return this.tutorProfileService.findByUserId(user.id);
  }

  @Patch('me')
  @RequirePermissions('tutor.self.update')
  @ApiOperation({ summary: 'Update own tutor profile bio and photo' })
  async updateMyProfile(@Body() dto: UpdateTutorProfileDto, @CurrentUser() user: RequestUser) {
    const profile = await this.tutorProfileService.findByUserId(user.id);
    return this.tutorProfileService.updateProfile(profile.id, dto, user.id);
  }

  @Get(':id')
  @RequirePermissions('tutor.read') // HR, Mentor, Demo Coordinator
  @ApiOperation({ summary: 'Get tutor profile by Profile ID' })
  async getProfile(@Param('id') id: string) {
    return this.tutorProfileService.findByProfileId(id);
  }

  // --- HR-Managed Fields ---
  @Patch(':id/experience')
  @RequirePermissions('tutor.manage')
  @ApiOperation({ summary: 'Update teaching experience (HR only)' })
  async updateExperience(
    @Param('id') id: string,
    @Body() dto: UpdateTeachingExperienceDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.tutorProfileService.updateExperience(id, dto, user.id);
  }

  @Post(':id/curricula/:curriculumId')
  @RequirePermissions('tutor.manage')
  @ApiOperation({ summary: 'Add a curriculum to tutor profile (HR only)' })
  async addCurriculum(
    @Param('id') id: string,
    @Param('curriculumId') curriculumId: string,
    @CurrentUser() user: RequestUser,
  ) {
    await this.tutorProfileService.addCurriculum(id, curriculumId, user.id);
    return { message: 'Curriculum added' };
  }

  @Delete(':id/curricula/:curriculumId')
  @RequirePermissions('tutor.manage')
  @ApiOperation({ summary: 'Remove a curriculum from tutor profile (HR only)' })
  async removeCurriculum(
    @Param('id') id: string,
    @Param('curriculumId') curriculumId: string,
    @CurrentUser() user: RequestUser,
  ) {
    await this.tutorProfileService.removeCurriculum(id, curriculumId, user.id);
    return { message: 'Curriculum removed' };
  }

  // --- Self-Service Fields ---
  @Post('me/subjects/:subjectId')
  @RequirePermissions('tutor.self.update')
  @ApiOperation({ summary: 'Add a subject to own profile' })
  async addMySubject(
    @Param('subjectId') subjectId: string,
    @CurrentUser() user: RequestUser,
  ) {
    const profile = await this.tutorProfileService.findByUserId(user.id);
    await this.tutorProfileService.addSubject(profile.id, subjectId, user.id);
    return { message: 'Subject added' };
  }

  @Delete('me/subjects/:subjectId')
  @RequirePermissions('tutor.self.update')
  @ApiOperation({ summary: 'Remove a subject from own profile' })
  async removeMySubject(
    @Param('subjectId') subjectId: string,
    @CurrentUser() user: RequestUser,
  ) {
    const profile = await this.tutorProfileService.findByUserId(user.id);
    await this.tutorProfileService.removeSubject(profile.id, subjectId, user.id);
    return { message: 'Subject removed' };
  }

  @Post('me/grades/:gradeId')
  @RequirePermissions('tutor.self.update')
  @ApiOperation({ summary: 'Add a grade to own profile' })
  async addMyGrade(
    @Param('gradeId') gradeId: string,
    @CurrentUser() user: RequestUser,
  ) {
    const profile = await this.tutorProfileService.findByUserId(user.id);
    await this.tutorProfileService.addGrade(profile.id, gradeId, user.id);
    return { message: 'Grade added' };
  }

  @Delete('me/grades/:gradeId')
  @RequirePermissions('tutor.self.update')
  @ApiOperation({ summary: 'Remove a grade from own profile' })
  async removeMyGrade(
    @Param('gradeId') gradeId: string,
    @CurrentUser() user: RequestUser,
  ) {
    const profile = await this.tutorProfileService.findByUserId(user.id);
    await this.tutorProfileService.removeGrade(profile.id, gradeId, user.id);
    return { message: 'Grade removed' };
  }
}
