import { Module } from '@nestjs/common';
import { HashchainModule } from '../hashchain/hashchain.module';
import { PairingModule } from '../pairing/pairing.module';
import { PublishController } from './publish.controller';
import { PublishService } from './publish.service';

/** 발행 트랜잭션 (SYS-013) + 멱등성 (SYS-014) + 페어링 (SIG-018). */
@Module({
  imports: [HashchainModule, PairingModule],
  controllers: [PublishController],
  providers: [PublishService],
})
export class PublishModule {}
