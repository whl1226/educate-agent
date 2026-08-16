import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrgController } from './org.controller';
import { OrgService } from './org.service';
import { User } from '../../db/entities/auth.entities';
import { ClassEntity, School, Student, StudentParentLink, TeacherClassLink } from '../../db/entities/org.entities';
import { AnswerRecord } from '../../db/entities/behavior.entities';
import { MasterySnapshot } from '../../db/entities/diagnosis.entities';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User, School, ClassEntity, TeacherClassLink, Student, StudentParentLink,
      AnswerRecord, MasterySnapshot,
    ]),
  ],
  controllers: [OrgController],
  providers: [OrgService],
  exports: [OrgService],
})
export class OrgModule {}