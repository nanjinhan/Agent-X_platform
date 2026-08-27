import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AgentModule } from '../agent/agent.module';
import { SubscriptionController } from './api/subscription.controller';
import { SubscriptionService } from './application/subscription.service';
import { SubscriptionRepository } from './infra/subscription.repository';

/**
 * 구독·체험·상태(6.3.3) — 의존: agent (SYS-002).
 * 내부 구조: api / application(공개 서비스) / infra(자기 테이블만).
 * 공개 인터페이스: SubscriptionService (billing T17이 사용 예정).
 */
@Module({
  imports: [AgentModule, JwtModule.register({})],
  controllers: [SubscriptionController],
  providers: [SubscriptionService, SubscriptionRepository],
  exports: [SubscriptionService],
})
export class SubscriptionModule {}
