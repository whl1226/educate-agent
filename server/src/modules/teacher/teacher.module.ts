import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TeacherController } from './teacher.controller';
import { TeacherService } from './teacher.service';
import { OrgModule } from '../org/org.module';
import { OfficeModule } from '../office/office.module';
import {
  CollabFeed, CollabGroup, CollabPlan, LessonPlan, MicroLesson,
  Resource, SkillReport, SpeechDoc, TeachingReview,
} from '../../db/entities/teacher.entities';
import { KnowledgeBaseEntry, Question, Template, TextbookContent } from '../../db/entities/knowledge.entities';
import {
  ClassEntity, School, Student, TeacherClassLink,
} from '../../db/entities/org.entities';
import { AnswerRecord, GradingItem, GradingTask, HomeworkAssignment, HomeworkSubmission, PaperQuestion, QuestionPaper } from '../../db/entities/behavior.entities';
import { FileRecord } from '../../db/entities/system.entities';

@Module({
  imports: [
    OrgModule,
    OfficeModule,
    TypeOrmModule.forFeature([
      LessonPlan, MicroLesson, SpeechDoc, TeachingReview, SkillReport,
      Resource, CollabGroup, CollabPlan, CollabFeed,
      KnowledgeBaseEntry, Question, Template, TextbookContent,
      QuestionPaper, PaperQuestion, HomeworkAssignment, HomeworkSubmission,
      GradingTask, GradingItem, AnswerRecord,
      ClassEntity, School, Student, TeacherClassLink,
      FileRecord,
    ]),
  ],
  controllers: [TeacherController],
  providers: [TeacherService],
  exports: [TeacherService],
})
export class TeacherModule {}