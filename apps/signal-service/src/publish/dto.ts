import { z } from 'zod';

/** 인코딩 깨진 입력 거부 (SEC-012) — core-api와 동일 정책 */
const clean = (s: string) => !s.includes('�');

export const PublishSignalSchema = z.object({
  agentId: z.string().uuid(),
  market: z.enum(['KOSPI', 'KOSDAQ', 'NYSE', 'NASDAQ', 'AMEX']),
  ticker: z.string().min(1).max(20),
  instrumentName: z.string().min(1).max(100).refine(clean, '유효하지 않은 문자'),
  action: z.enum(['ENTRY', 'EXIT']),
  referencePrice: z.number().positive().optional(),
  targetPrice: z.number().positive().optional(),
  stopLossPrice: z.number().positive().optional(),
  suggestedWeight: z.number().min(0).max(1).optional(),
  maxHoldingDays: z.number().int().min(1).max(180).optional(),
  /** SIG-002/AGT-017: 근거 최소 100자 */
  rationale: z.string().min(100).max(5000).refine(clean, '유효하지 않은 문자'),
  /** SYS-014 멱등성 */
  idempotencyKey: z.string().min(8).max(100).optional(),
});

export type PublishSignalDto = z.infer<typeof PublishSignalSchema>;
