import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type Redis from 'ioredis';
import { REDIS } from '../../../common/common.module';
import type { VerifiedIdentity } from '../domain/user.types';

/**
 * 본인인증 완료 신원을 짧게(10분) 보관하고 티켓 ID로만 참조한다.
 * PII를 클라이언트 토큰에 싣지 않기 위한 서버측 보관 (register가 1회 소비).
 */
@Injectable()
export class VerifiedIdentityStore {
  private static readonly TTL_SEC = 600;

  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  private key(ticket: string): string {
    return `verify_ticket:${ticket}`;
  }

  async put(identity: VerifiedIdentity): Promise<string> {
    const ticket = randomUUID();
    await this.redis.set(
      this.key(ticket),
      JSON.stringify({ ...identity, birthDate: identity.birthDate.toISOString() }),
      'EX',
      VerifiedIdentityStore.TTL_SEC,
    );
    return ticket;
  }

  /** 소비(get + delete). 없으면 null. */
  async take(ticket: string): Promise<VerifiedIdentity | null> {
    const raw = await this.redis.getdel(this.key(ticket));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Omit<VerifiedIdentity, 'birthDate'> & { birthDate: string };
    return { ...parsed, birthDate: new Date(parsed.birthDate) };
  }
}
