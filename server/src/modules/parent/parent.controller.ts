import { Body, Controller, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { ParentService } from './parent.service';
import { CurrentUser, JwtUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/security.decorators';
import { BizException } from '../../common/exceptions/biz.exception';
import { ErrorCodes } from '../../common/exceptions/error-codes';

@Controller()
export class ParentController {
  constructor(private readonly parent: ParentService) {}

  // ===== P1 脱敏学情周报 =====
  @Roles('parent', 'admin')
  @Get('weekly-report')
  weeklyReport(@CurrentUser() user: JwtUser, @Query('weekNo') weekNo?: string) {
    return this.parent.weeklyReport(user, weekNo ? Number(weekNo) : undefined);
  }

  // ===== P2 语音留言（家长↔班主任 / 家长↔孩子） =====
  @Roles('parent', 'admin', 'student')
  @Post('voice-messages')
  sendVoice(@CurrentUser() user: JwtUser, @Body() body: { text?: string; durationSec?: number; audioFileId?: number; teacherUserId?: number; target?: string }) {
    if (!body.text && !body.audioFileId) throw new BizException(ErrorCodes.VALIDATE_ERROR, 'text 或 audioFileId 必填');
    return this.parent.sendVoice(user, body);
  }

  @Roles('parent', 'admin', 'student')
  @Get('voice-messages')
  myMessages(@CurrentUser() user: JwtUser) {
    return this.parent.myMessages(user);
  }

  // ===== P4 育儿话术 =====
  @Roles('parent', 'admin')
  @Post('parenting-tips')
  tips(@CurrentUser() user: JwtUser, @Body() body: { scene?: string; context?: string }) {
    return this.parent.tips(user, body);
  }

  // ===== P5 亲子共学课程 =====
  @Roles('parent', 'admin')
  @Get('family-courses')
  listCourses(@CurrentUser() user: JwtUser) {
    return this.parent.listCourses(user);
  }

  @Roles('parent', 'admin')
  @Post('family-courses/:id/complete')
  completeCourse(@CurrentUser() user: JwtUser, @Param('id', ParseIntPipe) id: number) {
    return this.parent.completeCourse(user, id);
  }

  // ===== P3 大字版服务直达 =====
  @Roles('parent', 'admin')
  @Get('big-mode/services')
  bigModeServices() {
    return this.parent.bigModeServices();
  }
}