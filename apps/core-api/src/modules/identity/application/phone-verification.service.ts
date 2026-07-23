import { Injectable } from '@nestjs/common';
import { ApiErrorCode } from '@signals/contracts';
import { ApiError } from '../../../common/http/api-error';
import { PassProvider } from '../infra/pass.provider';
import { PhoneCodeStore } from '../infra/phone-code.store';
import { VerifiedIdentityStore } from '../infra/verified-identity.store';
import { isEligibleAge } from '../domain/age.util';

/**
 * 휴대폰 본인인증 (REG-020: 만 19세 미만 차단).
 * request → 코드 발급, confirm → 코드 검증 + 만 19세 확인 → 검증 티켓 발급.
 */
@Injectable()
export class PhoneVerificationService {
  constructor(
    private readonly pass: PassProvider,
    private readonly codes: PhoneCodeStore,
    private readonly identities: VerifiedIdentityStore,
  ) {}

  async requestCode(phone: string): Promise<void> {
    const code = this.pass.issueCode(phone);
    await this.codes.save(phone, code);
  }

  /**
   * 실 PASS에서는 name/birthDate/ci가 제공자 콜백으로 오지만,
   * 목 구현에서는 confirm 요청에 담겨 온다.
   */
  async confirm(input: {
    phone: string;
    code: string;
    name: string;
    birthDate: Date;
    ci: string;
  }): Promise<{ ticket: string }> {
    const ok = await this.codes.verify(input.phone, input.code);
    if (!ok) {
      throw new ApiError(ApiErrorCode.VERIFICATION_REQUIRED, '인증코드가 올바르지 않거나 만료되었습니다');
    }
    if (!isEligibleAge(input.birthDate, new Date())) {
      throw new ApiError(ApiErrorCode.AGE_RESTRICTED, '만 19세 미만은 가입할 수 없습니다');
    }
    const ticket = await this.identities.put({
      name: input.name,
      birthDate: input.birthDate,
      phone: input.phone,
      ci: input.ci,
    });
    return { ticket };
  }
}
