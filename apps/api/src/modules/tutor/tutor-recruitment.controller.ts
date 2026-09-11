import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser, RequestUser } from '../../common/auth/decorators/current-user.decorator';
import { PaginationQueryDto } from '../../common/pagination/pagination.dto';
import { RbacGuard } from '../../common/rbac/rbac.guard';
import { RequirePermissions } from '../../common/rbac/require-permissions.decorator';

import { AdvanceRecruitmentStageDto, CreateRecruitmentDto, RejectRecruitmentDto } from './dto/tutor-recruitment.dto';
import { TutorRecruitmentService } from './tutor-recruitment.service';

@ApiTags('Tutor Recruitment')
@ApiBearerAuth()
@UseGuards(RbacGuard)
@Controller('tutors/recruitment')
export class TutorRecruitmentController {
  constructor(private readonly tutorRecruitmentService: TutorRecruitmentService) {}

  @Get()
  @RequirePermissions('tutor.read') // HR staff usually have this
  @ApiOperation({ summary: 'List recruitment applications' })
  async findAll(@Query() query: PaginationQueryDto) {
    return this.tutorRecruitmentService.findAll({ limit: query.limit, cursor: query.cursor });
  }

  @Get(':id')
  @RequirePermissions('tutor.read')
  @ApiOperation({ summary: 'Get recruitment application details' })
  async findOne(@Param('id') id: string) {
    return this.tutorRecruitmentService.findOne(id);
  }

  @Post()
  @RequirePermissions('tutor.manage')
  @ApiOperation({ summary: 'Create new tutor enquiry' })
  async create(@Body() dto: CreateRecruitmentDto, @CurrentUser() user: RequestUser) {
    return this.tutorRecruitmentService.create(dto, user.id);
  }

  @Post(':id/stages')
  @RequirePermissions('tutor.manage')
  @ApiOperation({ summary: 'Advance recruitment stage' })
  async advanceStage(
    @Param('id') id: string,
    @Body() dto: AdvanceRecruitmentStageDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.tutorRecruitmentService.advanceStage(id, dto, user.id);
  }

  @Post(':id/reject')
  @RequirePermissions('tutor.manage')
  @ApiOperation({ summary: 'Reject recruitment application' })
  async reject(
    @Param('id') id: string,
    @Body() dto: RejectRecruitmentDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.tutorRecruitmentService.reject(id, dto, user.id);
  }
}
