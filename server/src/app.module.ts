import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { join } from 'path';
import { envSchema } from './config/env.validation';
import { GuardsModule } from './common/guards/guards.module';
import { AuthModule } from './modules/auth/auth.module';
import { AuditModule } from './modules/audit/audit.module';
import { CacheModule } from './modules/cache/cache.module';
import { SystemModule } from './modules/system/system.module';
import { AiModule } from './modules/ai/ai.module';
import { OrgModule } from './modules/org/org.module';
import { TeacherModule } from './modules/teacher/teacher.module';
import { StudentModule } from './modules/student/student.module';
import { ParentModule } from './modules/parent/parent.module';
import { AdminModule } from './modules/admin/admin.module';
import { AgentModule } from './modules/agent/agent.module';
import { KnowledgeModule } from './modules/knowledge/knowledge.module';
import { FilesModule } from './modules/files/files.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { OfficeModule } from './modules/office/office.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: join(process.cwd(), '.env'),
      validationSchema: envSchema,
      validationOptions: { abortEarly: false },
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const dbPath = config.get<string>('DB_PATH') || './data/xiangya.db';
        if (!dbPath.includes(':') && !dbPath.startsWith('/')) {
          process.env.DB_ABS = join(process.cwd(), dbPath);
        }
        return {
          type: 'better-sqlite3',
          database: process.env.DB_ABS || dbPath,
          autoLoadEntities: true,
          synchronize: config.get<boolean>('DB_SYNCHRONIZE') !== false,
          logging: config.get<boolean>('DB_LOGGING') === true,
          entities: [join(__dirname, 'db', 'entities', '*.entity.js')],
        };
      },
    }),
    GuardsModule,
    CacheModule,
    AuditModule,
    AuthModule,
    SystemModule,
    AiModule,
    OrgModule,
    TeacherModule,
    StudentModule,
    ParentModule,
    AdminModule,
    AgentModule,
    KnowledgeModule,
    FilesModule,
    NotificationsModule,
    OfficeModule,
  ],
})
export class AppModule {}