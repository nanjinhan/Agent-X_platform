import { Module } from '@nestjs/common';
import { HashchainModule } from '../hashchain/hashchain.module';
import { PublishController } from './publish.controller';
import { PublishService } from './publish.service';

/** 발행 트랜잭션 (SYS-013) + 멱등성 (SYS-014). */
@Module({
  imports: [HashchainModule],
  controllers: [PublishController],
  providers: [PublishService],
})
export class PublishModule {}
