import { Controller, Post, Get, Patch, Param, Body, UseGuards } from '@nestjs/common';

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
  NoShowDemoDto 
} from './dto/demo.dto';


@Controller('demos')
@UseGuards(JwtAuthGuard, RbacGuard)
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

  @Get()
  @RequirePermissions('demo.read') // Adjust reading based on ownership inside service or keep generic for now
  async getDemos(@CurrentUser() user: ValidatedUser) {
    // A production version would use pagination and filtering. 
    // Here we just fetch based on user's authorized scope.
    return this.demoService.getDemos(user);
  }

  @Get(':id')
  @RequirePermissions('demo.read')
  async getDemoById(
    @Param('id') id: string,
    @CurrentUser() user: ValidatedUser,
  ) {
    return this.demoService.getDemoById(id, user);
  }

  @Patch(':id/reschedule')
  async rescheduleDemo(
    @Param('id') id: string,
    @Body() dto: RescheduleDemoDto,
    @CurrentUser() user: ValidatedUser,
  ) {
    return this.demoService.rescheduleDemo(id, dto, user);
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
}
