import {
  Body, Controller, Get, Param, ParseIntPipe, Post, Query,
} from '@nestjs/common';
import { StudentService } from './student.service';
import { CurrentUser, JwtUser } from '../../common/decorators/current-user.decorator';
import { RateLimit, Roles } from '../../common/decorators/security.decorators';
import { BizException } from '../../common/exceptions/biz.exception';
import { ErrorCodes } from '../../common/exceptions/error-codes';

@Controller()
export class StudentController {
  constructor(private readonly student: StudentService) {}

  // ===== S1 苏格拉底辅导 =====
  @Roles('student', 'admin')
  @Post('tutor/sessions')
  createTutor(@CurrentUser() user: JwtUser) {
    return this.student.createTutorSession(user);
  }

  @Roles('student', 'admin')
  @Post('tutor/sessions/:id/messages')
  tutorMessage(@CurrentUser() user: JwtUser, @Param('id', ParseIntPipe) id: number, @Body() body: { content: string }) {
    if (!body.content?.trim()) throw new BizException(ErrorCodes.VALIDATE_ERROR, 'content 必填');
    return this.student.tutorMessage(user, id, body);
  }

  // ===== S4 知识问答 =====
  @Roles('student', 'admin')
  @Post('qa/sessions')
  createQa(@CurrentUser() user: JwtUser) {
    return this.student.createQaSession(user);
  }

  @Roles('student', 'admin')
  @Post('qa/sessions/:id/messages')
  qaMessage(@CurrentUser() user: JwtUser, @Param('id', ParseIntPipe) id: number, @Body() body: { content: string }) {
    if (!body.content?.trim()) throw new BizException(ErrorCodes.VALIDATE_ERROR, 'content 必填');
    return this.student.qaMessage(user, id, body);
  }

  // ===== 作答提交 =====
  @Roles('student', 'admin')
  @RateLimit({ limit: 60, windowSec: 60, keyPrefix: 'answers', byUser: true })
  @Post('answers')
  submitAnswer(@CurrentUser() user: JwtUser, @Body() body: { questionId: number; answer: string; durationSec?: number; paperId?: number; source?: string }) {
    return this.student.submitAnswer(user, body);
  }

  @Roles('student', 'parent', 'admin')
  @Get('practice/questions')
  practiceQuestions(@CurrentUser() user: JwtUser, @Query('knowledgePointId') kpId?: string, @Query('count') count?: string, @Query('subject') subject?: string) {
    return this.student.practiceQuestions(
      user,
      kpId ? Number(kpId) : undefined,
      count ? Math.min(Math.max(Number(count) || 3, 1), 10) : 3,
      subject || undefined,
    );
  }

  // ===== S3 认知诊断 =====
  @Roles('student', 'admin')
  @RateLimit({ limit: 10, windowSec: 60, keyPrefix: 'diag-run', byUser: true })
  @Post('diagnosis/run')
  runDiagnosis(@CurrentUser() user: JwtUser) {
    return this.student.runDiagnosis(user);
  }

  @Roles('student', 'admin')
  @Get('diagnosis/latest')
  latestDiagnosis(@CurrentUser() user: JwtUser) {
    return this.student.latestDiagnosis(user);
  }

  // ===== S5 错题本 =====
  @Roles('student', 'admin')
  @Get('error-book')
  errorBook(@CurrentUser() user: JwtUser) {
    return this.student.errorBook(user);
  }

  @Roles('student', 'admin')
  @Post('error-book/:id/review')
  reviewError(@CurrentUser() user: JwtUser, @Param('id', ParseIntPipe) id: number, @Body() body: { mastered?: boolean }) {
    return this.student.reviewError(user, id, body);
  }

  @Roles('student', 'admin')
  @Get('error-book/review-plan')
  reviewPlan(@CurrentUser() user: JwtUser) {
    return this.student.errorReviewPlan(user);
  }

  // ===== S6 学习计划 =====
  @Roles('student', 'admin')
  @Get('study-plan')
  studyPlan(@CurrentUser() user: JwtUser) {
    return this.student.studyPlan(user);
  }

  @Roles('student', 'admin')
  @RateLimit({ limit: 5, windowSec: 60, keyPrefix: 'plan-gen', byUser: true })
  @Post('study-plan/generate')
  generatePlan(@CurrentUser() user: JwtUser, @Body() body: { title?: string; weekNo?: number }) {
    return this.student.generatePlan(user, body);
  }

  @Roles('student', 'admin')
  @Post('study-plan/steps/:id/answer')
  answerStep(@CurrentUser() user: JwtUser, @Param('id', ParseIntPipe) id: number, @Body() body: { correct: boolean }) {
    return this.student.answerPlanStep(user, id, body);
  }

  // ===== S7 打卡 =====
  @Roles('student', 'admin')
  @Post('checkins')
  checkin(@CurrentUser() user: JwtUser, @Body() body: { note?: string }) {
    return this.student.checkin(user, body);
  }

  @Roles('student', 'admin')
  @Get('checkins/month')
  checkinMonth(@CurrentUser() user: JwtUser, @Query('month') month?: string) {
    return this.student.checkinMonth(user, month || '');
  }

  // ===== S8 英语听说 =====
  @Roles('student', 'admin')
  @RateLimit({ limit: 30, windowSec: 60, keyPrefix: 'voice-p', byUser: true })
  @Post('voice-practice')
  voicePractice(@CurrentUser() user: JwtUser, @Body() body: { sentence: string; score?: number; fluency?: number; accuracy?: number }) {
    return this.student.voicePractice(user, body);
  }

  @Roles('student', 'admin')
  @Get('voice-practice/score')
  voiceScore(@CurrentUser() user: JwtUser) {
    return this.student.voiceScore(user);
  }

  // ===== S9 语文朗读 =====
  @Roles('student', 'admin')
  @RateLimit({ limit: 30, windowSec: 60, keyPrefix: 'reading-p', byUser: true })
  @Post('reading-practice')
  readingPractice(@CurrentUser() user: JwtUser, @Body() body: { poem: string; score?: number; weakSyllables?: string[] }) {
    return this.student.readingPractice(user, body);
  }

  @Roles('student', 'admin')
  @Get('reading-practice/score')
  readingScore(@CurrentUser() user: JwtUser) {
    return this.student.readingScore(user);
  }

  // ===== S10 分级阅读 =====
  @Roles('student', 'parent', 'admin')
  @Get('books')
  listBooks(@Query('grade') grade?: string) {
    return this.student.listBooks(grade);
  }

  @Roles('student', 'admin')
  @Get('books/:id')
  bookDetail(@CurrentUser() user: JwtUser, @Param('id', ParseIntPipe) id: number) {
    return this.student.bookDetail(user, id);
  }

  @Roles('student', 'admin')
  @RateLimit({ limit: 20, windowSec: 60, keyPrefix: 'reading-prog', byUser: true })
  @Post('reading-progress')
  readingProgress(@CurrentUser() user: JwtUser, @Body() body: { bookId: number; chapter?: number; minutes?: number }) {
    return this.student.readingProgress(user, body);
  }

  @Roles('student', 'admin')
  @Post('reading-quiz')
  readingQuiz(@CurrentUser() user: JwtUser, @Body() body: { bookId: number; answers: number[] }) {
    return this.student.readingQuiz(user, body);
  }

  // ===== S11 心理轻提醒 =====
  @Roles('student', 'admin')
  @Get('mental/light-reminder')
  lightReminder(@CurrentUser() user: JwtUser) {
    return this.student.lightReminder(user);
  }

  // ===== S12 编程启蒙 =====
  @Roles('student', 'admin')
  @Get('code/tasks')
  codeTasks(@CurrentUser() user: JwtUser) {
    return this.student.codeTasks(user);
  }

  @Roles('student', 'admin')
  @RateLimit({ limit: 30, windowSec: 60, keyPrefix: 'code-run', byUser: true })
  @Post('code/run')
  codeRun(@CurrentUser() user: JwtUser, @Body() body: { script: string; taskId?: number }) {
    if (!body.script?.trim()) throw new BizException(ErrorCodes.VALIDATE_ERROR, 'script 必填');
    return this.student.codeRun(user, body);
  }

  // ===== 首页聚合 =====
  @Roles('student', 'admin')
  @Get('dashboard/home')
  home(@CurrentUser() user: JwtUser) {
    return this.student.home(user);
  }

  // ===== 兴趣画像 =====
  @Roles('student', 'admin')
  @Post('interest/profile')
  interest(@CurrentUser() user: JwtUser, @Body() body: { interests: string[]; dimension1?: string; dimension2?: string }) {
    return this.student.interestProfile(user, body);
  }
}