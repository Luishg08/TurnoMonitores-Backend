import { Module } from '@nestjs/common';
import { TurnoMonitoresController } from './turno-monitores.controller.js';

@Module({
  controllers: [TurnoMonitoresController],
})
export class AppModule {}
