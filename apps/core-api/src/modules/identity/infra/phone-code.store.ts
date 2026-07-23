import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS } from '../../../common/common.module';

/**
 * 휴대폰 인증코드 스토어. 코드는 5분 TTL. 인증요청 레이트리밋(SYS-031)은 게이트웨이 담당.
 */
@Injectable()
export class PhoneCodeStore {
  private static readonly TTL_SEC = 300;

  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  private key(phone: string): string {
    return `phone_code:${phone}`;
  }

  async save(phone: string, code: string): Promise<void> {
    await this.redis.set(this.key(phone), code, 'EX', PhoneCodeStore.TTL_SEC);
  }

  async verify(phone: string, code: string): Promise<boolean> {
    const stored = await this.redis.get(this.key(phone));
    if (stored && stored === code) {
      await this.redis.del(this.key(phone));
      return true;
    }
    return false;
  }
}
