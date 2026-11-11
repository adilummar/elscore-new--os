import { Body, Controller, Get, Headers, Param, Post, Put, Query, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';

import { CurrentUser, RequestUser } from '../../common/auth/decorators/current-user.decorator';
import { RbacGuard } from '../../common/rbac/rbac.guard';
import { RequirePermissions } from '../../common/rbac/require-permissions.decorator';

import { MAX_AUDIO_BYTES } from './class-workspace';
import { MentoringAccessService } from './mentoring-access.service';
import { MentoringClassWorkspaceService, UploadedAudio } from './mentoring-class-workspace.service';
import { MentoringClassService } from './mentoring-class.service';
import { WorkspaceListQueryDto } from './mentoring.dto';

type Body_ = Record<string, unknown>;

/** Sends a recording, or the part of it that was asked for. Seeking in a player needs 206 answers with Content-Range, and 416 for a range past the end. */
function sendAudio(res: Response, r: { stream: NodeJS.ReadableStream | null; mimeType: string; fileName: string; size: number; status: 200 | 206 | 416; start: number; end: number }) {
  const common = { 'Accept-Ranges': 'bytes', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-cache, no-store, must-revalidate' };
  if (r.status === 416 || !r.stream) {
    res.status(416).set({ ...common, 'Content-Range': `bytes */${r.size}` }).end();
    return;
  }
  res.status(r.status).set({
    ...common,
    'Content-Type': r.mimeType,
    'Content-Length': String(r.end - r.start + 1),
    'Content-Disposition': `inline; filename="${encodeURIComponent(r.fileName)}"`,
    ...(r.status === 206 ? { 'Content-Range': `bytes ${r.start}-${r.end}/${r.size}` } : {}),
  });
  r.stream.pipe(res);
}

/**
 * The class workspace for the Mentor. Reading is scoped in the query. Every change needs the Mentor work permission and is checked
 * again in the service against the student's assigned Mentor. Approving an exception belongs to the Mentoring Head alone, and
 * editing a template needs a permission that no role holds until it is granted.
 */
@UseGuards(RbacGuard)
@Controller('mentoring/class-workspace')
export class MentoringClassWorkspaceController {
  constructor(
    private readonly workspace: MentoringClassWorkspaceService,
    private readonly classes: MentoringClassService,
    private readonly access: MentoringAccessService,
  ) {}

  @Get('list')
  async list(@Query() q: WorkspaceListQueryDto, @CurrentUser() user: RequestUser) {
    return this.workspace.list(await this.access.scopeFor(user.id), q);
  }

  @Get('templates')
  async templates(@CurrentUser() user: RequestUser) {
    return this.workspace.listTemplates(await this.access.scopeFor(user.id));
  }

  @Put('templates/:templateKey')
  @RequirePermissions('mentoring.template.manage')
  async saveTemplate(@Param('templateKey') templateKey: string, @Body() body: Body_, @CurrentUser() user: RequestUser) {
    return this.workspace.saveTemplate(await this.access.scopeFor(user.id), templateKey, body);
  }

  @Get('audio/:attachmentId')
  async audio(@Param('attachmentId') attachmentId: string, @Res() res: Response, @CurrentUser() user: RequestUser, @Headers('range') range?: string) {
    return sendAudio(res, await this.workspace.voiceStream(attachmentId, user.id, await this.access.scopeFor(user.id), range));
  }

  @Post('shares/:shareId/copied')
  @RequirePermissions('mentoring.stage.work')
  copied(@Param('shareId') shareId: string, @CurrentUser() user: RequestUser) {
    return this.workspace.markCopied(user.id, 'MENTOR', shareId);
  }

  @Post('shares/:shareId/confirm')
  @RequirePermissions('mentoring.stage.work')
  confirm(@Param('shareId') shareId: string, @CurrentUser() user: RequestUser) {
    return this.workspace.confirmShare(user.id, 'MENTOR', shareId);
  }

  @Put('activities/:activityId/response')
  @RequirePermissions('mentoring.stage.work')
  response(@Param('activityId') activityId: string, @Body() body: Body_, @CurrentUser() user: RequestUser) {
    return this.workspace.recordResponse(user.id, 'MENTOR', activityId, body);
  }

  @Get(':key')
  async one(@Param('key') key: string, @CurrentUser() user: RequestUser) {
    return this.workspace.mentorWorkspace(await this.access.scopeFor(user.id), key);
  }

  @Post(':key/shares')
  @RequirePermissions('mentoring.stage.work')
  share(@Param('key') key: string, @Body() body: Body_, @CurrentUser() user: RequestUser) {
    return this.workspace.prepareShare(user.id, 'MENTOR', key, typeof body.templateKey === 'string' ? body.templateKey : '', (body.values as Body_) ?? {});
  }

  @Put(':key/meet-link')
  @RequirePermissions('mentoring.stage.work')
  meetLink(@Param('key') key: string, @Body() body: Body_, @CurrentUser() user: RequestUser) {
    return this.workspace.setMeetLink(user.id, key, body);
  }

  @Post(':key/cancel')
  @RequirePermissions('mentoring.stage.work')
  cancel(@Param('key') key: string, @Body() body: Body_, @CurrentUser() user: RequestUser) {
    return this.classes.cancel(key, body.reason, user.id);
  }

  @Post(':key/exception')
  @RequirePermissions('mentoring.stage.work')
  requestException(@Param('key') key: string, @Body() body: Body_, @CurrentUser() user: RequestUser) {
    return this.workspace.requestException(user.id, key, body);
  }

  @Post(':key/exception/decide')
  @RequirePermissions('mentoring.exception.authorize')
  async decideException(@Param('key') key: string, @Body() body: Body_, @CurrentUser() user: RequestUser) {
    return this.workspace.decideException(await this.access.scopeFor(user.id), key, body);
  }
}

/** The tutor's own class workspace. No route takes a tutor id: every answer starts from the signed-in user. */
@UseGuards(RbacGuard)
@Controller('tutor-portal/class-workspace')
export class TutorClassWorkspaceController {
  constructor(private readonly workspace: MentoringClassWorkspaceService) {}

  @Get('audio/:attachmentId')
  @RequirePermissions('tutor.portal.read')
  async audio(@Param('attachmentId') attachmentId: string, @Res() res: Response, @CurrentUser() user: RequestUser, @Headers('range') range?: string) {
    return sendAudio(res, await this.workspace.voiceStream(attachmentId, user.id, null, range));
  }

  @Post('shares/:shareId/copied')
  @RequirePermissions('tutor.portal.read')
  copied(@Param('shareId') shareId: string, @CurrentUser() user: RequestUser) {
    return this.workspace.markCopied(user.id, 'TUTOR', shareId);
  }

  @Post('shares/:shareId/confirm')
  @RequirePermissions('tutor.portal.read')
  confirm(@Param('shareId') shareId: string, @CurrentUser() user: RequestUser) {
    return this.workspace.confirmShare(user.id, 'TUTOR', shareId);
  }

  @Put('activities/:activityId')
  @RequirePermissions('tutor.portal.read')
  updateActivity(@Param('activityId') activityId: string, @Body() body: Body_, @CurrentUser() user: RequestUser) {
    return this.workspace.updateActivity(user.id, activityId, body);
  }

  @Post('activities/:activityId/remove')
  @RequirePermissions('tutor.portal.read')
  removeActivity(@Param('activityId') activityId: string, @CurrentUser() user: RequestUser) {
    return this.workspace.removeActivity(user.id, activityId);
  }

  @Post('activities/:activityId/shared')
  @RequirePermissions('tutor.portal.read')
  shareActivity(@Param('activityId') activityId: string, @CurrentUser() user: RequestUser) {
    return this.workspace.shareActivity(user.id, activityId);
  }

  @Put('activities/:activityId/response')
  @RequirePermissions('tutor.portal.read')
  response(@Param('activityId') activityId: string, @Body() body: Body_, @CurrentUser() user: RequestUser) {
    return this.workspace.recordResponse(user.id, 'TUTOR', activityId, body);
  }

  @Get(':key')
  @RequirePermissions('tutor.portal.read')
  one(@Param('key') key: string, @CurrentUser() user: RequestUser) {
    return this.workspace.tutorWorkspace(user.id, key);
  }

  @Post(':key/shares')
  @RequirePermissions('tutor.portal.read')
  share(@Param('key') key: string, @Body() body: Body_, @CurrentUser() user: RequestUser) {
    return this.workspace.prepareShare(user.id, 'TUTOR', key, typeof body.templateKey === 'string' ? body.templateKey : '', (body.values as Body_) ?? {});
  }

  @Post(':key/activities')
  @RequirePermissions('tutor.portal.read')
  addActivity(@Param('key') key: string, @Body() body: Body_, @CurrentUser() user: RequestUser) {
    return this.workspace.addActivity(user.id, key, body);
  }

  @Post(':key/voice')
  @RequirePermissions('tutor.portal.read')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_AUDIO_BYTES } }))
  uploadVoice(@Param('key') key: string, @UploadedFile() file: UploadedAudio | undefined, @CurrentUser() user: RequestUser) {
    return this.workspace.uploadVoice(user.id, key, file);
  }

  @Post(':key/voice/shared')
  @RequirePermissions('tutor.portal.read')
  voiceShared(@Param('key') key: string, @CurrentUser() user: RequestUser) {
    return this.workspace.confirmVoiceShared(user.id, key);
  }
}
