import { Injectable, Logger } from '@nestjs/common';
import { randomInt } from 'node:crypto';

/**
 * 본인인증(PASS) 제공자 — **목(mock) 구현**.
 *
 * 실 연동(NICE/KCB PASS)에서는 제공자가 인증 후 name/birth/CI/phone을 콜백으로 전달한다.
 * 여기서는 인터페이스만 확정하고, 개발용으로 6자리 코드를 발급/검증한다.
 * 신원 정보(name/birthDate/ci)는 confirm 요청에 담겨 온다고 가정한다(실 PASS의 콜백 대체).
 *
 * TODO(Phase 0): 실 PASS 계약 후 이 클래스를 실 제공자 어댑터로 교체.
 */
@Injectable()
export class PassProvider {
  private readonly logger = new Logger('PassProvider');

  /** 인증 코드 발급(실제로는 SMS 발송). 개발에서는 로그로 노출. */
  issueCode(phone: string): string {
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    this.logger.log(`[MOCK PASS] ${phone} 인증코드: ${code}`);
    return code;
  }
}
