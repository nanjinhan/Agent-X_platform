import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './api/auth.controller';
import { PhoneVerificationController } from './api/phone-verification.controller';
import { AuthService } from './application/auth.service';
import { PhoneVerificationService } from './application/phone-verification.service';
import { TokenService } from './application/token.service';
import { IdentityService } from './application/identity.service';
import { UserRepository } from './infra/user.repository';
import { SessionStore } from './infra/session.store';
import { PhoneCodeStore } from './infra/phone-code.store';
import { VerifiedIdentityStore } from './infra/verified-identity.store';
import { PassProvider } from './infra/pass.provider';

/**
 * 인증·인가·본인인증·사용자 (SYS-002: 의존 없음, 최하위 모듈).
 * 공개 인터페이스: IdentityService (타 모듈은 이것으로만 접근, SYS-003).
 */
@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController, PhoneVerificationController],
  providers: [
    AuthService,
    PhoneVerificationService,
    TokenService,
    IdentityService,
    UserRepository,
    SessionStore,
    PhoneCodeStore,
    VerifiedIdentityStore,
    PassProvider,
  ],
  exports: [IdentityService],
})
export class IdentityModule {}
