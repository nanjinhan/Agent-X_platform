import { Module } from '@nestjs/common';
import { HashchainModule } from '../hashchain/hashchain.module';
import { VerifyController } from './verify.controller';
import { VerifyService } from './verify.service';

/** 공개 검증 API (SYS-027/028). */
@Module({
  imports: [HashchainModule],
  controllers: [VerifyController],
  providers: [VerifyService],
})
export class VerifyModule {}
