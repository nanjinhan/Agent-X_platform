import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS } from '../../../common/common.module';

/**
 * Refresh Token 세션 스토어 (SYS-025).
 * - 세션(sid)마다 현재 유효한 refresh jti 1개를 저장 → 회전(rotation)
 * - 이미 회전되어 폐기된 jti가 다시 제시되면 = 재사용 감지 → 해당 사용자 전 세션 무효화
 * - 사용자별 sid 집합을 유지하여 일괄 무효화를 지원
 */
@Injectable()
export class SessionStore {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  private sidKey(sid: string): string {
    return `refresh:sid:${sid}`;
  }
  private userKey(userId: string): string {
    return `refresh:user:${userId}`;
  }

  async create(userId: string, sid: string, jti: string, ttlSec: number): Promise<void> {
    await this.redis
      .multi()
      .set(this.sidKey(sid), JSON.stringify({ userId, jti }), 'EX', ttlSec)
      .sadd(this.userKey(userId), sid)
      .expire(this.userKey(userId), ttlSec)
      .exec();
  }

  async currentJti(sid: string): Promise<{ userId: string; jti: string } | null> {
    const raw = await this.redis.get(this.sidKey(sid));
    return raw ? JSON.parse(raw) : null;
  }

  /** 회전: 세션의 유효 jti를 새 값으로 교체. */
  async rotate(userId: string, sid: string, newJti: string, ttlSec: number): Promise<void> {
    await this.redis.set(this.sidKey(sid), JSON.stringify({ userId, jti: newJti }), 'EX', ttlSec);
  }

  async revokeSession(sid: string): Promise<void> {
    const raw = await this.redis.get(this.sidKey(sid));
    if (raw) {
      const { userId } = JSON.parse(raw) as { userId: string };
      await this.redis.srem(this.userKey(userId), sid);
    }
    await this.redis.del(this.sidKey(sid));
  }

  /** 재사용 감지 시: 사용자의 모든 세션 무효화 (SYS-025). */
  async revokeAllForUser(userId: string): Promise<void> {
    const sids = await this.redis.smembers(this.userKey(userId));
    const pipe = this.redis.multi();
    for (const sid of sids) pipe.del(this.sidKey(sid));
    pipe.del(this.userKey(userId));
    await pipe.exec();
  }
}
