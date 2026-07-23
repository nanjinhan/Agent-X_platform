import { Global, Module } from '@nestjs/common';
import { Pool } from 'pg';
import Redis from 'ioredis';
import { ENV, loadEnv } from './env';
import { Cipher } from './crypto/cipher.util';

/**
 * 전역 인프라 provider: 검증된 env, DB 커넥션 풀(pg), Redis, 이름 암호화기.
 * 모듈들은 이 토큰을 주입받아 사용한다. (@Global — 매 모듈 import 불필요)
 */
export const PG_POOL = Symbol('PG_POOL');
export const REDIS = Symbol('REDIS');
export const CIPHER = Symbol('CIPHER');

@Global()
@Module({
  providers: [
    { provide: ENV, useFactory: loadEnv },
    {
      provide: PG_POOL,
      inject: [ENV],
      useFactory: (env: ReturnType<typeof loadEnv>) =>
        new Pool({ connectionString: env.DATABASE_URL, max: 10 }),
    },
    {
      provide: REDIS,
      inject: [ENV],
      useFactory: (env: ReturnType<typeof loadEnv>) => new Redis(env.REDIS_URL),
    },
    {
      provide: CIPHER,
      inject: [ENV],
      useFactory: (env: ReturnType<typeof loadEnv>) => new Cipher(env.NAME_ENC_KEY),
    },
  ],
  exports: [ENV, PG_POOL, REDIS, CIPHER],
})
export class CommonModule {}
