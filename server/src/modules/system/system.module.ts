import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SystemController } from './system.controller';
import { SystemConfig } from '../../db/entities/system.entities';

@Module({
  imports: [TypeOrmModule.forFeature([SystemConfig])],
  controllers: [SystemController],
})
export class SystemModule {}