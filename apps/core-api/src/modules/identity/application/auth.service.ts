import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { UserRole } from '@signals/domain';
import { ApiErrorCode } from '@signals/contracts';
import { ApiError } from '../../../common/http/api-error';
import { sha256hex } from '../../../common/crypto/hash.util';
import { UserRepository } from '../infra/user.repository';
import { VerifiedIdentityStore } from '../infra/verified-identity.store';
import { TokenService, type TokenPair } from './token.service';

/**
 * 가입·로그인·소셜·탈퇴 (SEC-001~002, REG-020, SYS-022).
 * 비밀번호는 Argon2id 해싱(SEC-002). 본인인증 티켓 없이는 가입 불가.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly users: UserRepository,
    private readonly identities: VerifiedIdentityStore,
    private readonly tokens: TokenService,
  ) {}

  async register(input: {
    email: string;
    password: string;
    verificationTicket: string;
    marketingConsent: boolean;
  }): Promise<TokenPair> {
    const identity = await this.identities.take(input.verificationTicket);
    if (!identity) {
      throw new ApiError(ApiErrorCode.VERIFICATION_REQUIRED, '본인인증이 필요합니다');
    }

    const ciHash = sha256hex(identity.ci);
    if (await this.users.existsByCiHash(ciHash)) {
      throw new ApiError(ApiErrorCode.ALREADY_REGISTERED, '이미 가입된 사용자입니다');
    }
    if (await this.users.findByEmail(input.email)) {
      throw new ApiError(ApiErrorCode.ALREADY_REGISTERED, '이미 사용 중인 이메일입니다');
    }

    const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });
    try {
      const user = await this.users.create({
        email: input.email,
        passwordHash,
        phoneHash: sha256hex(identity.phone),
        ciHash,
        name: identity.name,
        birthDate: identity.birthDate,
        role: UserRole.SUBSCRIBER,
        marketingConsent: input.marketingConsent,
      });
      return await this.tokens.issue(user.id, user.role);
    } catch (e) {
      // 사전 확인~INSERT 사이 경쟁 조건: UNIQUE(email, ci_hash) 위반은 409로 변환
      if ((e as { code?: string }).code === '23505') {
        throw new ApiError(ApiErrorCode.ALREADY_REGISTERED, '이미 가입된 사용자입니다');
      }
      throw e;
    }
  }

  async login(email: string, password: string): Promise<TokenPair> {
    const user = await this.users.findByEmail(email);
    if (!user || !user.passwordHash || user.status === 'WITHDRAWN') {
      // 타이밍 공격 완화: 사용자 없어도 해싱 비용을 소모한 뒤 실패
      await argon2.hash(password).catch(() => undefined);
      throw new ApiError(ApiErrorCode.UNAUTHENTICATED, '이메일 또는 비밀번호가 올바르지 않습니다');
    }
    const ok = await argon2.verify(user.passwordHash, password).catch(() => false);
    if (!ok) {
      throw new ApiError(ApiErrorCode.UNAUTHENTICATED, '이메일 또는 비밀번호가 올바르지 않습니다');
    }
    return this.tokens.issue(user.id, user.role);
  }

  /**
   * 소셜 로그인 — **목 구현**. 실 연동에서는 provider 토큰을 OAuth 검증해 이메일을 얻는다.
   * 신규 소셜 사용자도 본인인증(만 19세)이 필요하므로, 미가입이면 가입 유도로 응답한다.
   */
  async socialLogin(provider: string, email: string): Promise<TokenPair> {
    // 목 구현은 이메일만으로 로그인되므로 프로덕션 반입 시 계정 탈취 구멍이 된다.
    // 실 OAuth 어댑터로 교체 전까지 프로덕션에서 비활성화.
    if (process.env.NODE_ENV === 'production') {
      throw new ApiError(ApiErrorCode.UNAUTHENTICATED, '소셜 로그인은 아직 지원되지 않습니다');
    }
    const allowed = ['kakao', 'naver', 'google', 'apple'];
    if (!allowed.includes(provider)) {
      throw new ApiError(ApiErrorCode.UNAUTHENTICATED, '지원하지 않는 소셜 제공자입니다');
    }
    const user = await this.users.findByEmail(email);
    if (!user || user.status === 'WITHDRAWN') {
      // 미가입: 본인인증→register 경로로 유도 (409)
      throw new ApiError(ApiErrorCode.VERIFICATION_REQUIRED, '본인인증 후 가입이 필요합니다');
    }
    return this.tokens.issue(user.id, user.role);
  }

  refresh(refreshToken: string): Promise<TokenPair> {
    return this.tokens.rotate(refreshToken);
  }

  logout(refreshToken: string): Promise<void> {
    return this.tokens.revoke(refreshToken);
  }

  async withdraw(userId: string): Promise<void> {
    await this.users.withdraw(userId);
  }
}
