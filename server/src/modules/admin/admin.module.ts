import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AuditModule } from '../audit/audit.module';
import {
  Alert, AlertDisposal, AlertSignal, ResearchActivity, SchoolResourceStat,
  SuperviseTask, TeacherProfile, TeacherStat,
} from '../../db/entities/admin.entities';
import { School } from '../../db/entities/org.entities';
import { User } from '../../db/entities/auth.entities';
import { AnswerRecord } from '../../db/entities/behavior.entities';

@Module({
  imports: [
    AuditModule,
    TypeOrmModule.forFeature([
      Alert, AlertDisposal, AlertSignal, ResearchActivity, SchoolResourceStat,
      SuperviseTask, TeacherProfile, TeacherStat,
      School, User, AnswerRecord,
    ]),
  ],
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}