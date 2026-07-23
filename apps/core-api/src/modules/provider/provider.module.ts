import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { IdentityModule } from '../identity/identity.module';
import { ProviderController } from './api/provider.controller';
import { ProviderService } from './application/provider.service';
import { ProviderRepository } from './infra/provider.repository';

/**
 * 공급자·심사·정산정보 (SYS-002: 의존 identity).
 * 공개 인터페이스: ProviderService (agent 모듈이 사용).
 */
@Module({
  imports: [IdentityModule, JwtModule.register({})],
  controllers: [ProviderController],
  providers: [ProviderService, ProviderRepository],
  exports: [ProviderService],
})
export class ProviderModule {}
