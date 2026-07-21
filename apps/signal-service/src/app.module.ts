import { Module } from '@nestjs/common';
import { PublishModule } from './publish/publish.module';
import { HashchainModule } from './hashchain/hashchain.module';
import { PairingModule } from './pairing/pairing.module';
import { VerifyModule } from './verify/verify.module';
import { FeedModule } from './feed/feed.module';

/**
 * [REG-001] 시그널 동일성 원칙 — 이 서비스는 구독자 프로필·투자성향에
 * 접근하지 않는다. subscription 관련 의존성을 추가하는 PR은 거부된다.
 * 시그널은 agent에 종속되며 구독자는 수신자 목록일 뿐이다.
 */
@Module({
  imports: [
    PublishModule,
    HashchainModule,
    PairingModule,
    VerifyModule,
    FeedModule,
  ],
})
export class AppModule {}
