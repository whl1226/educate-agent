import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MulterModule } from '@nestjs/platform-express';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';
import { FileRecord } from '../../db/entities/system.entities';
import { Student, TeacherClassLink } from '../../db/entities/org.entities';

@Module({
  imports: [
    MulterModule.register({ limits: { fileSize: 100 * 1024 * 1024, files: 1 } }),
    TypeOrmModule.forFeature([FileRecord, Student, TeacherClassLink]),
  ],
  controllers: [FilesController],
  providers: [FilesService],
  exports: [FilesService],
})
export class FilesModule {}