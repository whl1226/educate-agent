import {
  Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query,
} from '@nestjs/common';
import { TeacherService } from './teacher.service';
import { CurrentUser, JwtUser } from '../../common/decorators/current-user.decorator';
import { RateLimit, ReplayProtected, Roles } from '../../common/decorators/security.decorators';
import { BizException } from '../../common/exceptions/biz.exception';
import { ErrorCodes } from '../../common/exceptions/error-codes';

@Controller()
export class TeacherController {
  constructor(private readonly teacher: TeacherService) {}

  // ===== T1 备课 =====
  @Roles('teacher', 'admin')
  @RateLimit({ limit: 10, windowSec: 60, keyPrefix: 'ai-gen', byUser: true })
  @ReplayProtected()
  @Post('ai/lesson/generate')
  generateLesson(@CurrentUser() user: JwtUser, @Body() input: Record<string, never>) {
    const p = input as unknown as { subject: string; grade: string; topic: string; periodCount?: number; duration?: number; bookVersion?: string; adaptation?: string; supplementary?: string };
    if (!p.topic) throw new BizException(ErrorCodes.VALIDATE_ERROR, 'topic 必填');
    return this.teacher.generateLessonPlan(user, { subject: p.subject || '语文', grade: p.grade || '五年级', topic: p.topic, periodCount: p.periodCount, duration: p.duration, bookVersion: p.bookVersion, adaptation: p.adaptation, supplementary: p.supplementary });
  }

  @Roles('teacher', 'admin')
  @Get('lesson-plans')
  listPlans(@CurrentUser() user: JwtUser) {
    return this.teacher.listLessonPlans(user);
  }

  @Roles('teacher', 'admin')
  @Get('lesson-plans/:id')
  lessonPlanDetail(@CurrentUser() user: JwtUser, @Param('id', ParseIntPipe) id: number) {
    return this.teacher.lessonPlanDetail(user, id);
  }

  @Roles('teacher', 'admin')
  @Delete('lesson-plans/:id')
  deletePlan(@CurrentUser() user: JwtUser, @Param('id', ParseIntPipe) id: number) {
    return this.teacher.deleteLessonPlan(user, id);
  }

  // ===== T2 组卷 =====
  @Roles('teacher', 'admin')
  @RateLimit({ limit: 10, windowSec: 60, keyPrefix: 'ai-paper', byUser: true })
  @ReplayProtected()
  @Post('ai/paper/generate')
  generatePaper(@CurrentUser() user: JwtUser, @Body() input: Record<string, never>) {
    const p = input as unknown as { subject?: string; grade?: string; title: string; layerMode?: string; questionCount?: number };
    if (!p.title) throw new BizException(ErrorCodes.VALIDATE_ERROR, 'title 必填');
    return this.teacher.generatePaper(user, { subject: p.subject || '语文', grade: p.grade || '五年级', title: p.title, layerMode: p.layerMode, questionCount: p.questionCount });
  }

  @Roles('teacher', 'admin')
  @Get('papers')
  listPapers(@CurrentUser() user: JwtUser) {
    return this.teacher.listPapers(user);
  }

  @Roles('teacher', 'admin')
  @Patch('papers/:id')
  patchPaper(@CurrentUser() user: JwtUser, @Param('id', ParseIntPipe) id: number, @Body() body: { title?: string; status?: string }) {
    return this.teacher.patchPaper(user, id, body);
  }

  @Roles('teacher', 'admin')
  @Delete('papers/:id')
  deletePaper(@CurrentUser() user: JwtUser, @Param('id', ParseIntPipe) id: number) {
    return this.teacher.deletePaper(user, id);
  }

  @Roles('teacher', 'admin')
  @Post('papers/:id/deploy')
  deployPaper(@CurrentUser() user: JwtUser, @Param('id', ParseIntPipe) id: number, @Body() body: { classId: number; deadline?: string }) {
    if (!body.classId) throw new BizException(ErrorCodes.VALIDATE_ERROR, 'classId 必填');
    return this.teacher.deployPaper(user, id, body);
  }

  @Roles('teacher', 'admin')
  @Get('papers/:id/export')
  exportPaper(@CurrentUser() user: JwtUser, @Param('id', ParseIntPipe) id: number) {
    return this.teacher.exportPaper(user, id);
  }

  @Roles('teacher', 'admin')
  @RateLimit({ limit: 10, windowSec: 60, keyPrefix: 'paper-dl', byUser: true })
  @Get('papers/:id/download')
  downloadPaper(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseIntPipe) id: number,
    @Query('format') format: string = 'docx',
  ) {
    if (format !== 'docx' && format !== 'pdf') {
      throw new BizException(ErrorCodes.VALIDATE_ERROR, 'format 仅支持 docx / pdf');
    }
    return this.teacher.downloadPaper(user, id, format);
  }

  // ===== T3 批改 =====
  @Roles('teacher', 'admin')
  @Get('grading/pending')
  gradingPending(@CurrentUser() user: JwtUser) {
    return this.teacher.gradingPending(user);
  }

  @Roles('teacher', 'admin')
  @Get('grading/:taskId/result')
  gradingResult(@CurrentUser() user: JwtUser, @Param('taskId', ParseIntPipe) taskId: number) {
    return this.teacher.gradingResult(user, taskId);
  }

  @Roles('teacher', 'admin')
  @Post('grading/:taskId/confirm')
  confirmGrading(@CurrentUser() user: JwtUser, @Param('taskId', ParseIntPipe) taskId: number) {
    return this.teacher.confirmGrading(user, taskId);
  }

  @Roles('teacher', 'admin')
  @Post('grading/:taskId/essay-comment')
  essayComment(@CurrentUser() user: JwtUser, @Param('taskId', ParseIntPipe) taskId: number, @Body() body: { submissionId?: number; comment: string }) {
    return this.teacher.essayComment(user, taskId, body);
  }

  // ===== T5 AI 教研员 =====
  @Roles('teacher', 'admin')
  @RateLimit({ limit: 10, windowSec: 60, keyPrefix: 'ai-res', byUser: true })
  @ReplayProtected()
  @Post('ai/researcher/comment')
  researcherComment(@CurrentUser() user: JwtUser, @Body() body: { sourceContent?: string }) {
    return this.teacher.researcher(user, 'comment', body);
  }

  @Roles('teacher', 'admin')
  @RateLimit({ limit: 10, windowSec: 60, keyPrefix: 'ai-res', byUser: true })
  @ReplayProtected()
  @Post('ai/researcher/talk-script')
  researcherTalk(@CurrentUser() user: JwtUser, @Body() body: { sourceContent?: string }) {
    return this.teacher.researcher(user, 'talk-script', body);
  }

  @Roles('teacher', 'admin')
  @RateLimit({ limit: 10, windowSec: 60, keyPrefix: 'ai-res', byUser: true })
  @ReplayProtected()
  @Post('ai/researcher/advice')
  researcherAdvice(@CurrentUser() user: JwtUser, @Body() body: { sourceContent?: string }) {
    return this.teacher.researcher(user, 'advice', body);
  }

  @Roles('teacher', 'admin')
  @Post('reviews/:id/adopt')
  adoptReview(@CurrentUser() user: JwtUser, @Param('id', ParseIntPipe) id: number) {
    return this.teacher.adoptReview(user, id);
  }

  // ===== T9/T10 =====
  @Roles('teacher', 'admin')
  @RateLimit({ limit: 10, windowSec: 60, keyPrefix: 'ai-speech', byUser: true })
  @ReplayProtected()
  @Post('ai/speech/generate')
  generateSpeech(@CurrentUser() user: JwtUser, @Body() body: { docType: string; theme: string; audience?: string; keyPoints?: string; duration?: number }) {
    if (!body.theme) throw new BizException(ErrorCodes.VALIDATE_ERROR, 'theme 必填');
    return this.teacher.generateSpeech(user, body);
  }

  @Roles('teacher', 'admin')
  @Get('speech-docs')
  listDocs(@CurrentUser() user: JwtUser, @Query('docType') docType?: string) {
    return this.teacher.listSpeechDocs(user, docType);
  }

  @Roles('teacher', 'admin')
  @Get('back-to-school/package')
  backToSchool() {
    return this.teacher.backToSchoolPackage();
  }

  @Roles('teacher', 'admin')
  @Patch('back-to-school/package/:id')
  updateBackToSchoolItem(@CurrentUser() user: JwtUser, @Param('id', ParseIntPipe) id: number, @Body('content') content: string) {
    return this.teacher.updateBackToSchoolItem(user, id, content);
  }

  @Roles('teacher', 'admin')
  @Get('knowledge-base')
  knowledgeBase(@Query('category') category?: string, @Query('scene') scene?: string) {
    return this.teacher.knowledgeBase(category, scene);
  }

  // ===== T12 基本功 =====
  @Roles('teacher', 'admin')
  @Get('skills/self-assessment')
  selfAssessment() {
    return this.teacher.selfAssessment();
  }

  @Roles('teacher', 'admin')
  @RateLimit({ limit: 10, windowSec: 60, keyPrefix: 'skills-report', byUser: true })
  @ReplayProtected()
  @Post('skills/report')
  skillReport(@CurrentUser() user: JwtUser, @Body() body: { self: Record<string, number> }) {
    return this.teacher.skillReport(user, body);
  }

  // ===== T13 职称 =====
  @Roles('teacher', 'admin')
  @Post('title/organize')
  organizeTitle(@CurrentUser() user: JwtUser, @Body() body: { items: string[] }) {
    if (!Array.isArray(body.items)) throw new BizException(ErrorCodes.VALIDATE_ERROR, 'items 必填');
    return this.teacher.organizeTitle(user, body);
  }

  // ===== T14 微课 =====
  @Roles('teacher', 'admin')
  @RateLimit({ limit: 10, windowSec: 60, keyPrefix: 'ai-micro', byUser: true })
  @ReplayProtected()
  @Post('ai/micro/generate')
  generateMicro(@CurrentUser() user: JwtUser, @Body() body: { topic: string; style?: string; format?: string; duration?: number; teleprompter?: boolean }) {
    if (!body.topic) throw new BizException(ErrorCodes.VALIDATE_ERROR, 'topic 必填');
    return this.teacher.generateMicro(user, body);
  }

  // ===== T6 资源 =====
  @Roles('teacher', 'admin')
  @Get('resources')
  listResources(
    @CurrentUser() user: JwtUser,
    @Query('license') license?: string,
    @Query('q') q?: string,
    @Query('type') type?: string,
  ) {
    return this.teacher.listResources(user, { license, q, type });
  }

  @Roles('teacher', 'admin')
  @Post('resources')
  createResource(@CurrentUser() user: JwtUser, @Body() body: { type?: string; title: string; description?: string; license?: string; fileId?: number }) {
    return this.teacher.createResource(user, body);
  }

  @Roles('teacher', 'admin')
  @Patch('resources/:id')
  patchResource(@CurrentUser() user: JwtUser, @Param('id', ParseIntPipe) id: number, @Body() body: { title?: string; description?: string; license?: string }) {
    return this.teacher.patchResource(user, id, body);
  }

  @Roles('teacher', 'admin')
  @Delete('resources/:id')
  deleteResource(@CurrentUser() user: JwtUser, @Param('id', ParseIntPipe) id: number) {
    return this.teacher.deleteResource(user, id);
  }

  // ===== T15 集体备课 =====
  @Roles('teacher', 'admin')
  @Get('collab/groups')
  collabGroups() {
    return this.teacher.listGroups();
  }

  @Roles('teacher', 'admin')
  @Post('collab/groups')
  createGroup(@CurrentUser() user: JwtUser, @Body() body: { name: string; school?: string; subject?: string }) {
    return this.teacher.createGroup(user, body);
  }

  @Roles('teacher', 'admin')
  @Post('collab/plans')
  createCollabPlan(@CurrentUser() user: JwtUser, @Body() body: { groupId: number; topic: string; mode?: string; plan: string }) {
    return this.teacher.createCollabPlan(user, body);
  }

  @Roles('teacher', 'admin')
  @Get('collab/feed')
  collabFeed(@Query('groupId') groupId?: string) {
    return this.teacher.collabFeed(groupId ? Number(groupId) : undefined);
  }

  // ===== T7 OCR 转教案 =====
  @Roles('teacher', 'admin')
  @ReplayProtected()
  @Post('files/ocr')
  ocrToLesson(@CurrentUser() user: JwtUser, @Body() body: { text: string }) {
    if (!body.text) throw new BizException(ErrorCodes.VALIDATE_ERROR, 'text 必填');
    return this.teacher.ocrToLesson(user, body.text);
  }
}