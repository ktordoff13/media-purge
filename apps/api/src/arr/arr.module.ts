import { Module } from '@nestjs/common';
import { ArrService } from './arr.service';
import { ArrController } from './arr.controller';

@Module({
  providers: [ArrService],
  controllers: [ArrController],
  exports: [ArrService],
})
export class ArrModule {}
