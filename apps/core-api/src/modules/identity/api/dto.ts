import { z } from 'zod';

/** SEC-002: 최소 10자, 영대/영소/숫자/특수 중 3종 이상. */
const passwordSchema = z
  .string()
  .min(10, '비밀번호는 최소 10자입니다')
  .refine((pw) => {
    const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/].filter((re) => re.test(pw)).length;
    return classes >= 3;
  }, '영문 대/소문자, 숫자, 특수문자 중 3종 이상을 포함해야 합니다');

const birthDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD 형식이어야 합니다')
  .transform((s) => new Date(`${s}T00:00:00Z`))
  .refine((d) => !Number.isNaN(d.getTime()), '유효한 날짜가 아닙니다');

export const RegisterSchema = z.object({
  email: z.string().email(),
  password: passwordSchema,
  verificationTicket: z.string().uuid(),
  consents: z.object({
    riskDisclosure: z.literal(true), // USR-002: 필수 동의
    marketing: z.boolean().default(false),
  }),
});
export type RegisterDto = z.infer<typeof RegisterSchema>;

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginDto = z.infer<typeof LoginSchema>;

/** 소셜 로그인 — 목: OAuth 검증을 대신해 확인된 이메일을 직접 받는다. */
export const SocialSchema = z.object({
  email: z.string().email(),
});
export type SocialDto = z.infer<typeof SocialSchema>;

export const PhoneRequestSchema = z.object({
  phone: z.string().regex(/^01\d{8,9}$/, '휴대폰 번호 형식이 아닙니다'),
});
export type PhoneRequestDto = z.infer<typeof PhoneRequestSchema>;

/** 목 PASS: 실 연동에서는 name/birthDate/ci가 제공자 콜백으로 대체됨. */
export const PhoneConfirmSchema = z.object({
  phone: z.string().regex(/^01\d{8,9}$/),
  code: z.string().regex(/^\d{6}$/),
  name: z.string().min(1).max(50),
  birthDate: birthDateSchema,
  ci: z.string().min(1),
});
export type PhoneConfirmDto = z.infer<typeof PhoneConfirmSchema>;
