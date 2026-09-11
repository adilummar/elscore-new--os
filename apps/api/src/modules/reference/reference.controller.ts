import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { PaginationQueryDto } from '../../common/pagination/pagination.dto';
import { RbacGuard } from '../../common/rbac/rbac.guard';
import { RequirePermissions } from '../../common/rbac/require-permissions.decorator';

import { CreateReferenceDto } from './dto/create-reference.dto';
import { UpdateReferenceStatusDto } from './dto/update-reference-status.dto';
import { ReferenceService } from './reference.service';

@ApiTags('Reference Data')
@ApiBearerAuth()
@UseGuards(RbacGuard)
@Controller('reference')
export class ReferenceController {
  constructor(private readonly referenceService: ReferenceService) {}

  @Get('subjects')
  @ApiOperation({ summary: 'List all subjects' })
  async findAllSubjects(@Query() query: PaginationQueryDto) {
    return this.referenceService.findAllSubjects({ limit: query.limit, cursor: query.cursor });
  }

  @Post('subjects')
  @RequirePermissions('reference.manage')
  @ApiOperation({ summary: 'Create a new subject' })
  async createSubject(@Body() dto: CreateReferenceDto) {
    return this.referenceService.createSubject(dto);
  }

  @Patch('subjects/:id/status')
  @RequirePermissions('reference.manage')
  @ApiOperation({ summary: 'Activate/Deactivate a subject' })
  async updateSubjectStatus(@Param('id') id: string, @Body() dto: UpdateReferenceStatusDto) {
    return this.referenceService.updateSubjectStatus(id, dto);
  }

  @Get('grades')
  @ApiOperation({ summary: 'List all grades' })
  async findAllGrades(@Query() query: PaginationQueryDto) {
    return this.referenceService.findAllGrades({ limit: query.limit, cursor: query.cursor });
  }

  @Post('grades')
  @RequirePermissions('reference.manage')
  @ApiOperation({ summary: 'Create a new grade' })
  async createGrade(@Body() dto: CreateReferenceDto) {
    return this.referenceService.createGrade(dto);
  }

  @Patch('grades/:id/status')
  @RequirePermissions('reference.manage')
  @ApiOperation({ summary: 'Activate/Deactivate a grade' })
  async updateGradeStatus(@Param('id') id: string, @Body() dto: UpdateReferenceStatusDto) {
    return this.referenceService.updateGradeStatus(id, dto);
  }

  @Get('curricula')
  @ApiOperation({ summary: 'List all curricula' })
  async findAllCurricula(@Query() query: PaginationQueryDto) {
    return this.referenceService.findAllCurricula({ limit: query.limit, cursor: query.cursor });
  }

  @Post('curricula')
  @RequirePermissions('reference.manage')
  @ApiOperation({ summary: 'Create a new curriculum' })
  async createCurriculum(@Body() dto: CreateReferenceDto) {
    return this.referenceService.createCurriculum(dto);
  }

  @Patch('curricula/:id/status')
  @RequirePermissions('reference.manage')
  @ApiOperation({ summary: 'Activate/Deactivate a curriculum' })
  async updateCurriculumStatus(@Param('id') id: string, @Body() dto: UpdateReferenceStatusDto) {
    return this.referenceService.updateCurriculumStatus(id, dto);
  }
}
