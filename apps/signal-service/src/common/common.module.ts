import { Global, Module } from '@nestjs/common';
import { Pool } from 'pg';
import { ENV, loadEnv } from './env';

/** 전역 인프라. core-api와 같은 패턴이지만 서비스가 독립 배포되므로 별도 유지(SYS-012). */
export const PG_POOL = Symbol('PG_POOL');

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
  ],
  exports: [ENV, PG_POOL],
})
export class CommonModule {}
