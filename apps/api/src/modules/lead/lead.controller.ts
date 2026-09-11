import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';

import { CurrentUser, RequestUser } from '../../common/auth/decorators/current-user.decorator';
import { RbacGuard } from '../../common/rbac/rbac.guard';
import { RbacService } from '../../common/rbac/rbac.service';
import { RequirePermissions } from '../../common/rbac/require-permissions.decorator';

import { CreateLeadDto } from './dto/create-lead.dto';
import { CreateSalesNoteDto } from './dto/create-sales-note.dto';
import { LeadQueryDto } from './dto/lead-query.dto';
import { ReassignLeadDto } from './dto/reassign-lead.dto';
import { UpdateLeadStatusDto } from './dto/update-lead-status.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { UpdateSalesNoteDto } from './dto/update-sales-note.dto';
import { LeadService } from './lead.service';

@UseGuards(RbacGuard)
@Controller('leads')
export class LeadController {
  constructor(
    private readonly leadService: LeadService,
    private readonly rbacService: RbacService,
  ) {}

  private async hasReadAll(userId: string): Promise<boolean> {
    const perms = await this.rbacService.getPermissionsForUser(userId);
    return perms.has('lead.read-all');
  }

  @Post()
  @RequirePermissions('lead.create')
  async create(@Body() dto: CreateLeadDto, @CurrentUser() user: RequestUser) {
    const readAll = await this.hasReadAll(user.id);
    return this.leadService.create(dto, user.id, readAll);
  }

  @Get()
  @RequirePermissions('lead.read')
  async findAll(@Query() query: LeadQueryDto, @CurrentUser() user: RequestUser) {
    const readAll = await this.hasReadAll(user.id);
    return this.leadService.findAll(query, user.id, readAll);
  }

  @Get(':id')
  @RequirePermissions('lead.read')
  async findOne(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    const readAll = await this.hasReadAll(user.id);
    return this.leadService.findOne(id, user.id, readAll);
  }

  @Patch(':id')
  @RequirePermissions('lead.update')
  async update(@Param('id') id: string, @Body() dto: UpdateLeadDto, @CurrentUser() user: RequestUser) {
    const readAll = await this.hasReadAll(user.id);
    return this.leadService.update(id, dto, user.id, readAll);
  }

  @Post(':id/status')
  @RequirePermissions('lead.status.change')
  async updateStatus(@Param('id') id: string, @Body() dto: UpdateLeadStatusDto, @CurrentUser() user: RequestUser) {
    const readAll = await this.hasReadAll(user.id);
    return this.leadService.updateStatus(id, dto, user.id, readAll);
  }

  @Post(':id/reassign')
  @RequirePermissions('lead.reassign')
  async reassign(@Param('id') id: string, @Body() dto: ReassignLeadDto, @CurrentUser() user: RequestUser) {
    return this.leadService.reassign(id, dto, user.id);
  }

  @Post(':id/archive')
  @RequirePermissions('lead.archive')
  async archive(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.leadService.setArchive(id, true, user.id);
  }

  @Post(':id/unarchive')
  @RequirePermissions('lead.archive') // same permission logically
  async unarchive(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.leadService.setArchive(id, false, user.id);
  }

  @Post(':id/reopen')
  @RequirePermissions('lead.reopen')
  async reopen(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    // Reopen resets archive flag, potentially sets status, but Spec says:
    // "Reopen is different from Unarchive... returns Lead to an active sales workflow."
    // For now, we will unarchive it. In future, might transition status to CONTACTED.
    return this.leadService.setArchive(id, false, user.id);
  }

  @Post(':id/notes')
  @RequirePermissions('salesnote.create')
  async createNote(@Param('id') id: string, @Body() dto: CreateSalesNoteDto, @CurrentUser() user: RequestUser) {
    const readAll = await this.hasReadAll(user.id);
    return this.leadService.createNote(id, dto, user.id, readAll);
  }

  @Patch(':id/notes/:noteId')
  @RequirePermissions('salesnote.update')
  async updateNote(
    @Param('id') leadId: string,
    @Param('noteId') noteId: string,
    @Body() dto: UpdateSalesNoteDto,
    @CurrentUser() user: RequestUser,
  ) {
    const readAll = await this.hasReadAll(user.id);
    return this.leadService.updateNote(leadId, noteId, dto, user.id, readAll);
  }

  @Delete(':id/notes/:noteId')
  @RequirePermissions('salesnote.delete')
  async deleteNote(
    @Param('id') leadId: string,
    @Param('noteId') noteId: string,
    @CurrentUser() user: RequestUser,
  ) {
    const readAll = await this.hasReadAll(user.id);
    return this.leadService.deleteNote(leadId, noteId, user.id, readAll);
  }
}
