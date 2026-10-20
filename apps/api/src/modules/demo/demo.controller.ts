import { Controller, Post, Get, Patch, Param, Body, UseGuards, Query } from '@nestjs/common';

import { ValidatedUser } from '../../common/auth/auth.service';
import { CurrentUser } from '../../common/auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/auth/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/rbac/rbac.guard';
import { RequirePermissions } from '../../common/rbac/require-permissions.decorator';

import { DemoService } from './demo.service';
import { 
  CreateDemoDto, 
  RescheduleDemoDto, 
  AssignTutorDto, 
  CompleteDemoDto, 
  CancelDemoDto, 
  NoShowDemoDto,
  EditDemoDto,
  SavePreparationDto,
  RecordMeetingLinkDto,
  ConfirmParentMeetingDto,
  ReassignCoordinatorDto,
} from './dto/demo.dto';


@Controller('demos')
@UseGuards(RbacGuard)
export class DemoController {
  constructor(private readonly demoService: DemoService) {}

  @Post()
  @RequirePermissions('demo.book')
  async bookDemo(
    @Body() dto: CreateDemoDto,
    @CurrentUser() user: ValidatedUser,
  ) {
    return this.demoService.bookDemo(dto, user);
  }

  @Get('summary')
  async getSummary(@CurrentUser() user: ValidatedUser) {
    return this.demoService.getSummary(user);
  }

  @Get('coordinators/list')
  async getCoordinators() {
    return this.demoService.getCoordinators();
  }

  @Get()
  async getDemos(
    @Query('view') view: string,
    @Query('status') status: string,
    @Query('stage') stage: string,
    @CurrentUser() user: ValidatedUser,
  ) {
    return this.demoService.getDemos(user, { view, status, stage });
  }

  @Get('tutors/search')
  @RequirePermissions('demo.assign_tutor')
  async searchTutors(
    @Query('search') search: string,
    @CurrentUser() user: ValidatedUser,
  ) {
    return this.demoService.searchTutors(search);
  }

  @Get(':id')
  async getDemoById(
    @Param('id') id: string,
    @CurrentUser() user: ValidatedUser,
  ) {
    return this.demoService.getDemoById(id, user);
  }

  @Patch(':id/preparation')
  async savePreparation(
    @Param('id') id: string,
    @Body() dto: SavePreparationDto,
    @CurrentUser() user: ValidatedUser,
  ) {
    return this.demoService.savePreparation(id, dto, user);
  }

  @Patch(':id/meeting-link')
  async recordMeetingLink(
    @Param('id') id: string,
    @Body() dto: RecordMeetingLinkDto,
    @CurrentUser() user: ValidatedUser,
  ) {
    return this.demoService.recordMeetingLink(id, dto, user);
  }

  @Get(':id/whatsapp-preview')
  async getWhatsAppPreview(
    @Param('id') id: string,
    @CurrentUser() user: ValidatedUser,
  ) {
    return this.demoService.getWhatsAppPreview(id, user);
  }

  @Post(':id/whatsapp-share')
  async recordWhatsAppOutreach(
    @Param('id') id: string,
    @CurrentUser() user: ValidatedUser,
  ) {
    return this.demoService.recordWhatsAppOutreach(id, user);
  }

  @Patch(':id/parent-confirmation')
  async confirmParentMeeting(
    @Param('id') id: string,
    @Body() dto: ConfirmParentMeetingDto,
    @CurrentUser() user: ValidatedUser,
  ) {
    return this.demoService.confirmParentMeeting(id, dto, user);
  }

  @Patch(':id/reassign-coordinator')
  async reassignCoordinator(
    @Param('id') id: string,
    @Body() dto: ReassignCoordinatorDto,
    @CurrentUser() user: ValidatedUser,
  ) {
    return this.demoService.reassignCoordinator(id, dto, user);
  }

  @Patch(':id/reschedule')
  async rescheduleDemo(
    @Param('id') id: string,
    @Body() dto: RescheduleDemoDto,
    @CurrentUser() user: ValidatedUser,
  ) {
    return this.demoService.rescheduleDemo(id, dto, user);
  }

  @Patch(':id')
  async editDemo(
    @Param('id') id: string,
    @Body() dto: EditDemoDto,
    @CurrentUser() user: ValidatedUser,
  ) {
    return this.demoService.editDemo(id, dto, user);
  }

  @Get(':id/tutor-suggestions')
  @RequirePermissions('demo.assign_tutor')
  async getTutorSuggestions(
    @Param('id') id: string,
    @CurrentUser() user: ValidatedUser,
  ) {
    return this.demoService.getTutorSuggestions(id, user);
  }

  @Patch(':id/assign')
  @RequirePermissions('demo.assign_tutor')
  async assignTutor(
    @Param('id') id: string,
    @Body() dto: AssignTutorDto,
    @CurrentUser() user: ValidatedUser,
  ) {
    return this.demoService.assignTutor(id, dto, user);
  }

  @Patch(':id/complete')
  async completeDemo(
    @Param('id') id: string,
    @Body() dto: CompleteDemoDto,
    @CurrentUser() user: ValidatedUser,
  ) {
    return this.demoService.completeDemo(id, dto, user);
  }

  @Patch(':id/cancel')
  async cancelDemo(
    @Param('id') id: string,
    @Body() dto: CancelDemoDto,
    @CurrentUser() user: ValidatedUser,
  ) {
    return this.demoService.cancelDemo(id, dto, user);
  }

  @Patch(':id/no-show')
  async markNoShow(
    @Param('id') id: string,
    @Body() dto: NoShowDemoDto,
    @CurrentUser() user: ValidatedUser,
  ) {
    return this.demoService.markNoShow(id, dto, user);
  }

  @Patch('exceptions/:exceptionId/review')
  async reviewSessionException(
    @Param('exceptionId') exceptionId: string,
    @Body() dto: { decision: any; reviewNotes?: string },
    @CurrentUser() user: ValidatedUser,
  ) {
    return this.demoService.reviewSessionException(exceptionId, dto, user);
  }
}
