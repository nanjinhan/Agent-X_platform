import { Module } from '@nestjs/common';
import { CommonModule } from './common/common.module';
import { IdentityModule } from './modules/identity/identity.module';
import { ProviderModule } from './modules/provider/provider.module';
import { AgentModule } from './modules/agent/agent.module';
import { MarketdataModule } from './modules/marketdata/marketdata.module';
import { RankingModule } from './modules/ranking/ranking.module';
import { SubscriptionModule } from './modules/subscription/subscription.module';
import { BillingModule } from './modules/billing/billing.module';
import { SettlementModule } from './modules/settlement/settlement.module';
import { ModerationModule } from './modules/moderation/moderation.module';
import { AuditModule } from './modules/audit/audit.module';

/**
 * 모듈러 모놀리스 루트 (SYS-001).
 * 모듈 간 의존 방향은 SYS-002 표를 따르며 순환 의존 금지 (SYS-003).
 * 시그널 발행·전달은 여기 없다 — apps/signal-service로 분리 (SYS-012).
 */
@Module({
  imports: [
    CommonModule,
    IdentityModule,
    ProviderModule,
    AgentModule,
    MarketdataModule,
    RankingModule,
    SubscriptionModule,
    BillingModule,
    SettlementModule,
    ModerationModule,
    AuditModule,
  ],
})
export class AppModule {}
