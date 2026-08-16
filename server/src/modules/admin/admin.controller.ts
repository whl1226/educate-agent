import {
  Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { CurrentUser, JwtUser } from '../../common/decorators/current-user.decorator';
import { ReplayProtected, Roles, RateLimit } from '../../common/decorators/security.decorators';

@Controller()
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  // ===== A1 区域看板 =====
  @Roles('admin')
  @Get('admin/region/overview')
  regionOverview() {
    return this.admin.regionOverview();
  }

  // ===== A2 师资台账 =====
  @Roles('admin')
  @Get('admin/teachers/ledger')
  teacherLedger(@Query('schoolId') schoolId?: string) {
    return this.admin.teacherLedger(schoolId ? Number(schoolId) : undefined);
  }

  // ===== A3/A4 预警与处置 =====
  @Roles('admin')
  @Get('admin/alerts')
  listAlerts(@Query('status') status?: string, @Query('type') type?: string) {
    return this.admin.listAlerts(status, type);
  }

  @Roles('admin')
  @Get('admin/alerts/:id')
  alertDetail(@Param('id', ParseIntPipe) id: number) {
    return this.admin.alertDetail(id);
  }

  @Roles('admin')
  @ReplayProtected()
  @Post('admin/alerts/:id/resolve')
  resolveAlert(@CurrentUser() user: JwtUser, @Param('id', ParseIntPipe) id: number, @Body() body: { action: string; note?: string }) {
    return this.admin.resolveAlert(user, id, body);
  }

  // ===== A5 督导任务 =====
  @Roles('admin')
  @Get('admin/supervise-tasks')
  superviseTasks(@Query('status') status?: string) {
    return this.admin.superviseTasks(status);
  }

  @Roles('admin')
  @ReplayProtected()
  @Post('admin/supervise-tasks')
  createTask(@CurrentUser() user: JwtUser, @Body() body: { title: string; owner?: string; deadline?: string }) {
    return this.admin.createTask(user, body);
  }

  @Roles('admin')
  @Patch('admin/supervise-tasks/:id')
  updateTask(@CurrentUser() user: JwtUser, @Param('id', ParseIntPipe) id: number, @Body() body: { status?: string; owner?: string }) {
    return this.admin.updateTask(user, id, body);
  }

  // ===== A6 教师画像 =====
  @Roles('admin')
  @Get('admin/teacher-portraits')
  teacherPortraits() {
    return this.admin.teacherPortraits();
  }

  // ===== A7 城乡资源均衡 =====
  @Roles('admin')
  @Get('admin/resource-balance')
  resourceBalance() {
    return this.admin.resourceBalance();
  }

  // ===== 教研活动 =====
  @Roles('admin')
  @Get('admin/research-activities')
  activities(@Query('status') status?: string) {
    return this.admin.listActivities(status);
  }

  // ===== 审计日志 =====
  @Roles('admin')
  @Get('admin/audit-logs')
  auditLogs(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('userId') userId?: string,
    @Query('action') action?: string,
    @Query('module') module?: string,
  ) {
    return this.admin.auditLogs(page, pageSize, userId, action, module);
  }

  // ===== AI 生成 =====
  @Roles('admin')
  @RateLimit({ limit: 10, windowSec: 60, keyPrefix: 'admin-ai', byUser: true })
  @ReplayProtected()
  @Post('admin/ai/generate')
  aiGenerate(@CurrentUser() user: JwtUser, @Body() body: { feature: string; topic?: string; data?: string }) {
    return this.admin.aiGenerate(user, body.feature || '通用', body);
  }
}