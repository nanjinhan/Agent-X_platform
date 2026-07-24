import { z } from 'zod';

/** signal-service 환경변수. Core API 장애와 무관하게 뜰 수 있어야 한다(SYS-012). */
const EnvSchema = z.object({
  DATABASE_URL: z.string().url(),
  PORT_SIGNAL_SERVICE: z.coerce.number().default(3001),
  /** 개발용 키 보관 폴더 (gitignore). 운영은 KMS 사용 — SEC-017 */
  SIGNING_KEY_DIR: z.string().default('.keys'),
  SIGNING_KEY_ID: z.string().min(3).default('signals-dev-01'),
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(): Env {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) throw new Error(`Invalid environment: ${parsed.error.message}`);
  return parsed.data;
}

export const ENV = Symbol('ENV');
