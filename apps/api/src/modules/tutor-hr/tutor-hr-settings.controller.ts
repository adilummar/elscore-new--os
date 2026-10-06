import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/rbac/require-permissions.decorator';
import { JwtAuthGuard } from '../../common/auth/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/rbac/rbac.guard';
import { CreateMasterDataDto, CreateTutorSalarySlabDto, UpdateMasterDataDto, UpdateTutorSalarySlabDto } from './dto/tutor-hr-settings.dto';
import { TutorHrSettingsService } from './tutor-hr-settings.service';

@ApiTags('Tutor HR Settings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('tutor-hr/settings')
export class TutorHrSettingsController {
  constructor(private readonly settingsService: TutorHrSettingsService) {}

  @Get('mother-tongues')
  @RequirePermissions('tutor_lead.manage', 'tutor_hr.settings.manage')
  getMotherTongues() {
    return this.settingsService.getMotherTongues();
  }

  @Post('mother-tongues')
  @RequirePermissions('tutor_hr.settings.manage')
  createMotherTongue(@Body() dto: CreateMasterDataDto) {
    return this.settingsService.createMotherTongue(dto);
  }

  @Patch('mother-tongues/:id')
  @RequirePermissions('tutor_hr.settings.manage')
  updateMotherTongue(@Param('id') id: string, @Body() dto: UpdateMasterDataDto) {
    return this.settingsService.updateMotherTongue(id, dto);
  }

  @Get('communication-languages')
  @RequirePermissions('tutor_lead.manage', 'tutor_hr.settings.manage')
  getCommunicationLanguages() {
    return this.settingsService.getCommunicationLanguages();
  }

  @Post('communication-languages')
  @RequirePermissions('tutor_hr.settings.manage')
  createCommunicationLanguage(@Body() dto: CreateMasterDataDto) {
    return this.settingsService.createCommunicationLanguage(dto);
  }

  @Patch('communication-languages/:id')
  @RequirePermissions('tutor_hr.settings.manage')
  updateCommunicationLanguage(@Param('id') id: string, @Body() dto: UpdateMasterDataDto) {
    return this.settingsService.updateCommunicationLanguage(id, dto);
  }

  @Get('salary-slabs')
  @RequirePermissions('tutor_lead.manage', 'tutor_hr.settings.manage')
  getSalarySlabs() {
    return this.settingsService.getSalarySlabs();
  }

  @Post('salary-slabs')
  @RequirePermissions('tutor_hr.settings.manage')
  createSalarySlab(@Body() dto: CreateTutorSalarySlabDto) {
    return this.settingsService.createSalarySlab(dto);
  }

  @Patch('salary-slabs/:id')
  @RequirePermissions('tutor_hr.settings.manage')
  updateSalarySlab(@Param('id') id: string, @Body() dto: UpdateTutorSalarySlabDto) {
    return this.settingsService.updateSalarySlab(id, dto);
  }
}
