import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StudentController } from './student.controller';
import { StudentService } from './student.service';
import {
  AiConversation, AiMessage, Badge, Book, CodeProgress,
  ReadingPracticeRecord, ReadingProgress, VoicePracticeRecord,
} from '../../db/entities/student.entities';
import { AnswerRecord, Checkin, HomeworkAssignment, HomeworkSubmission } from '../../db/entities/behavior.entities';
import {
  DiagnosisRecord, ErrorBook, InterestProfile, MasterySnapshot, PlanStep, StudyPlan,
} from '../../db/entities/diagnosis.entities';
import { KnowledgePoint, Question, TextbookContent } from '../../db/entities/knowledge.entities';
import { Notification, SystemConfig } from '../../db/entities/system.entities';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AiConversation, AiMessage, Badge, Book, CodeProgress, ReadingPracticeRecord,
      ReadingProgress, VoicePracticeRecord,
      AnswerRecord, Checkin, HomeworkAssignment, HomeworkSubmission,
      DiagnosisRecord, ErrorBook, InterestProfile, MasterySnapshot, PlanStep, StudyPlan,
      KnowledgePoint, Question, TextbookContent,
      Notification, SystemConfig,
    ]),
  ],
  controllers: [StudentController],
  providers: [StudentService],
  exports: [StudentService],
})
export class StudentModule {}