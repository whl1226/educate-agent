import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FileRecord } from '../../db/entities/system.entities';
import { OfficeService } from './office.service';

@Module({
  imports: [TypeOrmModule.forFeature([FileRecord])],
  providers: [OfficeService],
  exports: [OfficeService],
})
export class OfficeModule {}
