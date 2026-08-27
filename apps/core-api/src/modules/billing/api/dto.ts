import { z } from 'zod';

/** 결제수단 등록 — 대상 구독 + 카드 토큰(PG가 발급한 일회성 토큰). 카드정보 원본은 받지 않는다. */
export const RegisterMethodSchema = z.object({
  subscriptionId: z.string().uuid(),
  cardToken: z.string().min(1).max(200),
});
export type RegisterMethodInput = z.infer<typeof RegisterMethodSchema>;

/** PG 웹훅 — payload는 서명 대상 원문 문자열, signature는 PG HMAC. */
export const WebhookSchema = z.object({
  payload: z.string().min(1).max(10000),
  signature: z.string().min(1).max(200),
});
export type WebhookInput = z.infer<typeof WebhookSchema>;

/** 환불 요청 — 대상 구독 + 사유(REG-015 케이스). */
export const RefundRequestSchema = z.object({
  subscriptionId: z.string().uuid(),
  reason: z.enum([
    'WITHDRAWAL',
    'CANCELLATION',
    'NO_SIGNALS',
    'AGENT_SUSPENDED',
    'PROVIDER_VIOLATION',
    'SYSTEM_OUTAGE',
  ]),
  detail: z.string().max(500).optional(),
});
export type RefundRequestInput = z.infer<typeof RefundRequestSchema>;
