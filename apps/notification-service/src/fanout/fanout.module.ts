import { Module } from '@nestjs/common';

/** SignalPublished 수신 → 구독자 조회 → 500명 단위 배치 분할 (SYS-015) */
@Module({})
export class FanoutModule {}
