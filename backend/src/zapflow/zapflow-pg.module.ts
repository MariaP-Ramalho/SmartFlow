import { Module, Global } from '@nestjs/common';
import { ZapFlowPgService } from './zapflow-pg.service';
import { ZapFlowController } from './zapflow.controller';

@Global()
@Module({
  controllers: [ZapFlowController],
  providers: [ZapFlowPgService],
  exports: [ZapFlowPgService],
})
export class ZapFlowPgModule {}
