import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentRun, AgentMessage, AgentTask } from '../../db/entities/agent.entities';
import { AuditLog } from '../../db/entities/system.entities';
import { AgentService } from './agent.service';
import { AgentController } from './agent.controller';
import { ApprovalService } from './approval';
import { StudentModule } from '../student/student.module';
import { TeacherModule } from '../teacher/teacher.module';
import { OrgModule } from '../org/org.module';
import { ParentModule } from '../parent/parent.module';
import { AdminModule } from '../admin/admin.module';
import { OfficeModule } from '../office/office.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([AgentRun, AgentMessage, AgentTask, AuditLog]),
    StudentModule,
    TeacherModule,
    OrgModule,
    ParentModule,
    AdminModule,
    OfficeModule,
  ],
  providers: [AgentService, ApprovalService],
  controllers: [AgentController],
  exports: [AgentService],
})
export class AgentModule {}
