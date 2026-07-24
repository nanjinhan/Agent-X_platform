import { Module } from '@nestjs/common';
import { HashchainService } from './hashchain.service';
import { KeyManager } from './key-manager';

/**
 * sequence_no 채번·prev_hash 연결·content_hash·서버 서명 (8.2 발행 락).
 * ⚠️ 규격은 ADR-0002에 고정. 발행 시작 후 변경 불가 (TR-4).
 */
@Module({
  providers: [HashchainService, KeyManager],
  exports: [HashchainService, KeyManager],
})
export class HashchainModule {}
