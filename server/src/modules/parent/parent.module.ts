import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ParentController } from './parent.controller';
import { ParentService } from './parent.service';
import { OrgModule } from '../org/org.module';
import {
  FamilyCourse, FamilyCourseProgress, VoiceMessage, WeeklyReport,
} from '../../db/entities/parent.entities';
import { AnswerRecord, Checkin } from '../../db/entities/behavior.entities';

@Module({
  imports: [
    OrgModule,
    TypeOrmModule.forFeature([
      FamilyCourse, FamilyCourseProgress, VoiceMessage, WeeklyReport,
      AnswerRecord, Checkin,
    ]),
  ],
  controllers: [ParentController],
  providers: [ParentService],
  exports: [ParentService],
})
export class ParentModule {}