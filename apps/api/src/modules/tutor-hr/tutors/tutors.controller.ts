import { Body, Controller, Delete, Get, Header, Param, ParseUUIDPipe, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser, RequestUser } from '../../../common/auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../../common/auth/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/rbac/rbac.guard';
import { RequirePermissions } from '../../../common/rbac/require-permissions.decorator';

import {
  ChangeTutorStatusDto, HrNoteDto, ListTutorsQueryDto, QualificationDto, SummaryQueryDto, UpdateTutorProfileDto,
} from './tutor-profile.dto';
import { NOTES_MANAGE, PROFILE_MANAGE, TutorProfileService } from './tutor-profile.service';
import { TutorTransferService } from './tutor-transfer.service';
import { CoordinationService } from '../coordination/coordination.service';

/**
 * Tutor Management — Tutors (HR side). Tutor Coordinators and tutors have none of these
 * permissions; HR Internal Notes and History & Status are HR Staff / HR Head only.
 * Static routes are declared before ":id" so they are not captured by it.
 */
@ApiTags('Tutor Management — Tutors')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('tutor-hr/tutors')
export class TutorsController {
  constructor(
    private readonly transfer: TutorTransferService,
    private readonly profiles: TutorProfileService,
    private readonly coordination: CoordinationService,
  ) {}

  @Post('ready-for-assignment/:leadId')
  @RequirePermissions('tutor_hr.ready_for_assignment')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Final verification: create the tutor account and Tutor ID. Returns the temporary password once.' })
  ready(@Param('leadId', ParseUUIDPipe) leadId: string, @CurrentUser() user: RequestUser) {
    return this.transfer.readyForAssignment(leadId, user.id);
  }

  @Get('summary')
  @RequirePermissions('tutor_hr.tutors.read')
  @ApiOperation({ summary: 'Central dashboard cards: Active, Total, New (by verification date), Inactive, Suspended' })
  summary(@Query() q: SummaryQueryDto) {
    return this.profiles.summary(q);
  }

  @Get()
  @RequirePermissions('tutor_hr.tutors.read')
  list(@Query() q: ListTutorsQueryDto) {
    return this.profiles.list(q);
  }

  @Get(':id')
  @RequirePermissions('tutor_hr.profile.read')
  @Header('Cache-Control', 'no-store')
  profile(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: RequestUser) {
    return this.profiles.getProfile(id, user.id);
  }

  @Patch(':id')
  @RequirePermissions(PROFILE_MANAGE)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTutorProfileDto, @CurrentUser() user: RequestUser) {
    return this.profiles.updateProfile(id, dto, user.id);
  }

  @Post(':id/qualifications')
  @RequirePermissions(PROFILE_MANAGE)
  addQualification(@Param('id', ParseUUIDPipe) id: string, @Body() dto: QualificationDto, @CurrentUser() user: RequestUser) {
    return this.profiles.addQualification(id, dto, user.id);
  }

  @Put(':id/qualifications/:qid')
  @RequirePermissions(PROFILE_MANAGE)
  updateQualification(
    @Param('id', ParseUUIDPipe) id: string, @Param('qid', ParseUUIDPipe) qid: string, @Body() dto: QualificationDto, @CurrentUser() user: RequestUser,
  ) {
    return this.profiles.updateQualification(id, qid, dto, user.id);
  }

  @Delete(':id/qualifications/:qid')
  @RequirePermissions(PROFILE_MANAGE)
  @ApiOperation({ summary: 'Hide a qualification (kept in history)' })
  removeQualification(@Param('id', ParseUUIDPipe) id: string, @Param('qid', ParseUUIDPipe) qid: string, @CurrentUser() user: RequestUser) {
    return this.profiles.removeQualification(id, qid, user.id);
  }

  @Post(':id/status')
  @RequirePermissions(PROFILE_MANAGE)
  @ApiOperation({ summary: 'Change status (any to any); a reason is mandatory and history is kept' })
  status(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ChangeTutorStatusDto, @CurrentUser() user: RequestUser) {
    return this.profiles.changeStatus(id, dto, user.id);
  }

  @Get(':id/observations')
  @RequirePermissions('tutor_hr.profile.read')
  @ApiOperation({ summary: 'Feedback & Observations: coordinator, assignment history and observations (read-only)' })
  observations(@Param('id', ParseUUIDPipe) id: string) {
    return this.coordination.profileView(id);
  }

  @Get(':id/history')
  @RequirePermissions(NOTES_MANAGE)
  @ApiOperation({ summary: 'History & Status: complete tutor journey (HR team only)' })
  history(@Param('id', ParseUUIDPipe) id: string) {
    return this.profiles.history(id);
  }

  @Get(':id/notes')
  @RequirePermissions(NOTES_MANAGE)
  @Header('Cache-Control', 'no-store')
  notes(@Param('id', ParseUUIDPipe) id: string) {
    return this.profiles.listNotes(id);
  }

  @Post(':id/notes')
  @RequirePermissions(NOTES_MANAGE)
  addNote(@Param('id', ParseUUIDPipe) id: string, @Body() dto: HrNoteDto, @CurrentUser() user: RequestUser) {
    return this.profiles.addNote(id, dto, user.id);
  }

  @Patch(':id/notes/:noteId')
  @RequirePermissions(NOTES_MANAGE)
  editNote(
    @Param('id', ParseUUIDPipe) id: string, @Param('noteId', ParseUUIDPipe) noteId: string, @Body() dto: HrNoteDto, @CurrentUser() user: RequestUser,
  ) {
    return this.profiles.editNote(id, noteId, dto, user.id);
  }
}
