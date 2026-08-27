import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { BillingController } from './api/billing.controller';
import { RefundController } from './api/refund.controller';
import { BillingService } from './application/billing.service';
import { RefundService } from './application/refund.service';
import { BillingRepository } from './infra/billing.repository';
import { RefundRepository } from './infra/refund.repository';
import { MockPgProvider } from './infra/mock-pg.provider';

/**
 * 결제·환불·PG 연동 (SUB-017/018, REG-014~016) — 의존: subscription(구독 결제필드 갱신).
 * 공개 인터페이스: BillingService·RefundService (정산 T25가 사용 예정).
 * ⚠️ MockPgProvider는 실 PG(토스/포트원) 어댑터로 교체하는 지점 (Phase 0).
 */
@Module({
  imports: [JwtModule.register({})],
  controllers: [BillingController, RefundController],
  providers: [BillingService, RefundService, BillingRepository, RefundRepository, MockPgProvider],
  exports: [BillingService, RefundService],
})
export class BillingModule {}
