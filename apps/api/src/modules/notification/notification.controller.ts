import { Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser, RequestUser } from '../../common/auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/auth/guards/jwt-auth.guard';

import { NotificationService } from './notification.service';

/** In-app notification inbox. Every route is scoped to the caller's own notifications. */
@ApiTags('Notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationController {
  constructor(private readonly service: NotificationService) {}

  @Get()
  @ApiOperation({ summary: 'My notifications, newest first' })
  list(@CurrentUser() user: RequestUser, @Query('unread') unread?: string, @Query('limit') limit?: string) {
    return this.service.list(user.id, { unreadOnly: unread === 'true', limit: limit ? Number(limit) || undefined : undefined });
  }

  @Get('unread-count')
  async unreadCount(@CurrentUser() user: RequestUser) {
    return { unread: await this.service.unreadCount(user.id) };
  }

  @Post('read-all')
  readAll(@CurrentUser() user: RequestUser) {
    return this.service.markAllRead(user.id);
  }

  @Post(':id/read')
  read(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: RequestUser) {
    return this.service.markRead(user.id, id);
  }
}
