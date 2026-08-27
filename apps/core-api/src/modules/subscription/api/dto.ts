import { z } from 'zod';

/** 체험·구독 신청 — 대상 에이전트만. 가격은 서버가 에이전트에서 락인(조작 불가). */
export const SubscribeSchema = z.object({
  agentId: z.string().uuid(),
});
export type SubscribeInput = z.infer<typeof SubscribeSchema>;
