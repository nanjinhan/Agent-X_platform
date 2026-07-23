import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ProviderModule } from '../provider/provider.module';
import { AgentController } from './api/agent.controller';
import { AgentService } from './application/agent.service';
import { AgentRepository } from './infra/agent.repository';

/**
 * 에이전트·룰·상태머신 (SYS-002: 의존 provider).
 * 공개 인터페이스: AgentService (subscription·signal-service가 사용 예정).
 */
@Module({
  imports: [ProviderModule, JwtModule.register({})],
  controllers: [AgentController],
  providers: [AgentService, AgentRepository],
  exports: [AgentService],
})
export class AgentModule {}
