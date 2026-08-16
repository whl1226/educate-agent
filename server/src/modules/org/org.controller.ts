import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Query,
} from '@nestjs/common';
import { OrgService } from './org.service';
import { Roles } from '../../common/decorators/security.decorators';
import { CurrentUser, JwtUser } from '../../common/decorators/current-user.decorator';
import { BizException } from '../../common/exceptions/biz.exception';
import { ErrorCodes } from '../../common/exceptions/error-codes';

@Controller()
export class OrgController {
  constructor(private readonly org: OrgService) {}

  /** 分页参数钳制：page >= 1，pageSize 1~100（防负值/超大值拉全表） */
  private clampPage(page: string | number): number {
    return Math.max(1, Math.floor(Number(page)) || 1);
  }

  private clampPageSize(pageSize: string | number): number {
    return Math.min(100, Math.max(1, Math.floor(Number(pageSize)) || 20));
  }

  // ================= 用户管理 =================

  @Roles('admin')
  @Get('users')
  listUsers(
    @Query('page') page = 1,
    @Query('pageSize') pageSize = 20,
    @Query('role') role?: string,
    @Query('keyword') keyword?: string,
  ) {
    return this.org.listUsers(this.clampPage(page), this.clampPageSize(pageSize), role, keyword);
  }

  @Roles('teacher', 'admin', 'parent')
  @Get('users/teachers')
  listTeachers() {
    return this.org.listTeachers();
  }

  @Roles('admin')
  @Patch('users/:id')
  async patchUser(
    @CurrentUser() admin: JwtUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { status?: string },
  ) {
    if (body.status && !['active', 'disabled'].includes(body.status)) {
      throw new BizException(ErrorCodes.VALIDATE_ERROR, 'status 仅支持 active/disabled');
    }
    return this.org.patchUser(admin.id, id, { status: body.status });
  }

  // ================= 班级 =================

  @Get('classes')
  myClasses(@CurrentUser() user: JwtUser) {
    return this.org.myClasses(user);
  }

  @Get('classes/:id/students')
  async classStudents(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseIntPipe) id: number,
    @Query('page') page = 1,
    @Query('pageSize') pageSize = 20,
    @Query('keyword') keyword?: string,
  ) {
    await this.org.assertClassTeacher(user, id);
    return this.org.classStudents(id, this.clampPage(page), this.clampPageSize(pageSize), keyword);
  }

  @Get('classes/:id/overview')
  async classOverview(@CurrentUser() user: JwtUser, @Param('id', ParseIntPipe) id: number) {
    await this.org.assertClassTeacher(user, id);
    return this.org.classOverview(id);
  }

  @Get('classes/:id/knowledge-mastery')
  async knowledgeMastery(@CurrentUser() user: JwtUser, @Param('id', ParseIntPipe) id: number) {
    await this.org.assertClassTeacher(user, id);
    return this.org.knowledgeMastery(id);
  }

  @Get('classes/:id/risk-students')
  async riskStudents(@CurrentUser() user: JwtUser, @Param('id', ParseIntPipe) id: number) {
    await this.org.assertClassTeacher(user, id);
    return this.org.riskStudents(id);
  }

  @Get('classes/:id/trends')
  async classTrends(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseIntPipe) id: number,
    @Query('days') days = 7,
  ) {
    await this.org.assertClassTeacher(user, id);
    return this.org.classTrends(id, Number(days) || 7);
  }

  // ================= 学生个体 =================

  @Get('students/:id/mastery')
  studentMastery(@CurrentUser() user: JwtUser, @Param('id', ParseIntPipe) id: number) {
    return this.org.studentMastery(user, id);
  }

  @Get('parents/:id/children')
  async parentChildren(@CurrentUser() user: JwtUser, @Param('id', ParseIntPipe) id: number) {
    if (user.role !== 'admin' && user.id !== id) {
      throw new BizException(ErrorCodes.SCOPE_FORBIDDEN);
    }
    return this.org.parentChildren(id);
  }
}