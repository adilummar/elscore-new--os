import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser, RequestUser } from '../../common/auth/decorators/current-user.decorator';
import { RbacGuard } from '../../common/rbac/rbac.guard';
import { RequirePermissions } from '../../common/rbac/require-permissions.decorator';

import { ReplaceAvailabilityDto, TutorExceptionDto, UpdateTeachingExperienceDto, UpdateTutorProfileDto } from './dto/tutor-profile.dto';
import { TutorAvailabilityService } from './tutor-availability.service';
import { TutorCalendarService } from './tutor-calendar.service';
import { TutorExceptionService } from './tutor-exception.service';
import { TutorProfileService } from './tutor-profile.service';

@ApiTags('Tutor Profiles')
@ApiBearerAuth()
@UseGuards(RbacGuard)
@Controller('tutors/profile')
export class TutorProfileController {
  constructor(
    private readonly tutorProfileService: TutorProfileService,
    private readonly availability: TutorAvailabilityService,
    private readonly calendars: TutorCalendarService,
    private readonly exceptions: TutorExceptionService,
  ) {}

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

  // --- Weekly availability. These two routes come before :id so "me" is not read as a profile id. ---
  @Get('me/availability')
  @RequirePermissions('tutor.self.update')
  @ApiOperation({ summary: 'Get own weekly availability' })
  async getMyAvailability(@CurrentUser() user: RequestUser) {
    return this.availability.get(await this.availability.profileIdForUser(user.id));
  }

  @Put('me/availability')
  @RequirePermissions('tutor.self.update')
  @ApiOperation({ summary: 'Replace own weekly availability' })
  async replaceMyAvailability(@Body() dto: ReplaceAvailabilityDto, @CurrentUser() user: RequestUser) {
    return this.availability.replace(await this.availability.profileIdForUser(user.id), dto.windows, user.id);
  }

  @Get(':id')
  @RequirePermissions('tutor.profile.read')
  @ApiOperation({ summary: 'Get tutor profile by Profile ID' })
  async getProfile(@Param('id') id: string) {
    return this.tutorProfileService.findByProfileId(id);
  }

  /** A tutor's real timetable for a range of dates (at most a month). Who is behind a booked class is shown only to people who may see that student. */
  @Get(':id/calendar')
  @RequirePermissions('tutor.profile.read')
  @ApiOperation({ summary: 'Get a tutor date-wise timetable' })
  async getCalendar(@Param('id') id: string, @Query('from') from: string, @Query('to') to: string, @CurrentUser() user: RequestUser) {
    return this.calendars.calendar(id, from, to, user.id);
  }

  // --- Dates that change the weekly pattern. Literal paths come before :id. ---
  @Post('holidays')
  @RequirePermissions('tutor.profile.manage')
  @ApiOperation({ summary: 'Add a public holiday for every tutor (HR)' })
  async addHoliday(@Body() dto: TutorExceptionDto, @CurrentUser() user: RequestUser) {
    return this.exceptions.create(null, { ...dto, kind: 'HOLIDAY' }, user.id);
  }

  @Delete('exceptions/:exceptionId')
  @RequirePermissions('tutor.profile.manage')
  @ApiOperation({ summary: 'Remove a holiday or a tutor date exception (HR)' })
  async removeException(@Param('exceptionId') exceptionId: string, @CurrentUser() user: RequestUser) {
    return this.exceptions.deactivate(exceptionId, user.id);
  }

  @Get(':id/exceptions')
  @RequirePermissions('tutor.profile.read')
  @ApiOperation({ summary: 'List a tutor date exceptions in a range' })
  async listExceptions(@Param('id') id: string, @Query('from') from: string, @Query('to') to: string) {
    return this.exceptions.list(id, from, to);
  }

  @Post(':id/exceptions')
  @RequirePermissions('tutor.profile.manage')
  @ApiOperation({ summary: 'Add a day off, extra hours or blocked time for one tutor (HR)' })
  async addException(@Param('id') id: string, @Body() dto: TutorExceptionDto, @CurrentUser() user: RequestUser) {
    return this.exceptions.create(id, dto, user.id);
  }

  @Get(':id/availability')
  @RequirePermissions('tutor.profile.manage')
  @ApiOperation({ summary: 'Get a tutor weekly availability (HR)' })
  async getAvailability(@Param('id') id: string) {
    return this.availability.get(id);
  }

  @Put(':id/availability')
  @RequirePermissions('tutor.profile.manage')
  @ApiOperation({ summary: 'Replace a tutor weekly availability (HR)' })
  async replaceAvailability(@Param('id') id: string, @Body() dto: ReplaceAvailabilityDto, @CurrentUser() user: RequestUser) {
    return this.availability.replace(id, dto.windows, user.id);
  }

  // --- HR-Managed Fields ---
  @Patch(':id/experience')
  @RequirePermissions('tutor.profile.manage')
  @ApiOperation({ summary: 'Update teaching experience (HR only)' })
  async updateExperience(
    @Param('id') id: string,
    @Body() dto: UpdateTeachingExperienceDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.tutorProfileService.updateExperience(id, dto, user.id);
  }

  @Post(':id/curricula/:curriculumId')
  @RequirePermissions('tutor.profile.manage')
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
  @RequirePermissions('tutor.profile.manage')
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
