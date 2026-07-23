import { z } from 'zod';

/**
 * 환경변수 스키마 검증 (SEC-012 입력 검증의 연장).
 * 부팅 시 1회 파싱하여 잘못된 설정으로 뜨는 것을 막는다.
 */
const EnvSchema = z.object({
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  PORT_CORE_API: z.coerce.number().default(3000),

  JWT_ACCESS_SECRET: z.string().min(8),
  JWT_REFRESH_SECRET: z.string().min(8),
  JWT_ACCESS_TTL_MIN: z.coerce.number().default(30),
  JWT_REFRESH_TTL_DAYS: z.coerce.number().default(30),

  NAME_ENC_KEY: z.string().regex(/^[0-9a-fA-F]{64}$/, 'NAME_ENC_KEY must be 32-byte hex'),
  COOKIE_SECURE: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(): Env {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Invalid environment: ${parsed.error.message}`);
  }
  return parsed.data;
}

export const ENV = Symbol('ENV');
