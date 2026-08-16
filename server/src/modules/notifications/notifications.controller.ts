import { Body, Controller, Get, Param, ParseIntPipe, Post } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { CurrentUser, JwtUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/security.decorators';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notes: NotificationsService) {}

  @Roles('teacher', 'student', 'parent', 'admin')
  @Get()
  list(@CurrentUser() user: JwtUser) {
    return this.notes.list(user);
  }

  @Roles('teacher', 'student', 'parent', 'admin')
  @Get('unread-count')
  unread(@CurrentUser() user: JwtUser) {
    return this.notes.unreadCount(user);
  }

  @Roles('teacher', 'student', 'parent', 'admin')
  @Post(':id/read')
  read(@CurrentUser() user: JwtUser, @Param('id', ParseIntPipe) id: number) {
    return this.notes.markRead(user, id);
  }

  @Roles('teacher', 'student', 'parent', 'admin')
  @Post('read-all')
  readAll(@CurrentUser() user: JwtUser) {
    return this.notes.markAllRead(user);
  }

  @Roles('admin')
  @Post('push')
  push(@Body() body: { userId: number; title: string; content?: string; type?: string; link?: string }) {
    return this.notes.push(body.userId, body.title, body.content ?? '', body.type ?? 'system', body.link ?? null);
  }
}