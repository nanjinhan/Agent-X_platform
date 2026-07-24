import { Module } from '@nestjs/common';
import { CommonModule } from './common/common.module';
import { HashchainModule } from './hashchain/hashchain.module';
import { PublishModule } from './publish/publish.module';
import { PairingModule } from './pairing/pairing.module';
import { VerifyModule } from './verify/verify.module';

/**
 * [REG-001] 시그널 동일성 원칙 — 이 서비스는 구독자 프로필·투자성향에 접근하지 않는다.
 * subscription 관련 의존성을 추가하는 PR은 거부된다.
 * 시그널은 agent에 종속되며 구독자는 수신자 목록일 뿐이다.
 *
 * T6 범위: 해시체인·서명·발행·공개검증. T7에서 pairing/feed 추가.
 */
@Module({
  imports: [CommonModule, HashchainModule, PairingModule, PublishModule, VerifyModule],
})
export class AppModule {}
